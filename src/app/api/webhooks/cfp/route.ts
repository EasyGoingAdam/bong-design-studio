import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { log, timer, newRequestId } from '@/lib/log';

/**
 * Webhook receiver for the Customize Freeze Pipe app.
 *
 * Configure on customize-freezepipe.com/admin/settings:
 *   URL    → https://<this-app>/api/webhooks/cfp
 *   Events → design_submitted, status_changed, note_added,
 *            image_regenerated, version_added (all 5)
 *   Secret → set CFP_WEBHOOK_SECRET to the same value the admin shows
 *            on creation (only displayed once)
 *
 * Lifecycle per delivery:
 *   1. Verify HMAC-SHA256 signature (constant-time). 401 on mismatch.
 *   2. Replay protection (X-Cfp-Timestamp within 5 min).
 *   3. Audit-log to cfp_webhook_events Supabase table (idempotent on
 *      delivery_id). Best-effort — won't 5xx if the table is missing.
 *   4. Always return 200 on valid deliveries so CFP doesn't log retries.
 *
 * Every step has its own log line so we can grep for failures by stage
 * without enabling debug verbosity:
 *   op=cfp.webhook.recv     — entry
 *   op=cfp.webhook.sig_fail / sig_ok
 *   op=cfp.webhook.stale    — replay-window rejection
 *   op=cfp.webhook.persist  — audit-log insert (ok / fail)
 *   op=cfp.webhook.done     — exit (always)
 *
 * Migration to enable webhook history (optional):
 *   create table cfp_webhook_events (
 *     id uuid primary key default gen_random_uuid(),
 *     event_type text not null,
 *     delivery_id text not null unique,
 *     design_id text,
 *     payload jsonb not null,
 *     received_at timestamptz default now()
 *   );
 *   create index on cfp_webhook_events (event_type, received_at desc);
 */

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

function verifySignature(rawBody: string, signatureHeader: string, secret: string): boolean {
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const got = signatureHeader.replace(/^sha256=/, '');
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const reqId = newRequestId();
  const elapsed = timer();

  const secret = process.env.CFP_WEBHOOK_SECRET;
  const eventType = req.headers.get('x-cfp-event') || 'unknown';
  const deliveryId = req.headers.get('x-cfp-delivery-id') || '';
  const timestamp = req.headers.get('x-cfp-timestamp') || '';

  log.info('cfp.webhook.recv', {
    req_id: reqId, event_type: eventType, delivery_id: deliveryId.slice(0, 8),
  });

  if (!secret) {
    log.error('cfp.webhook.unconfigured', { req_id: reqId });
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-cfp-signature') || '';
  if (!signature) {
    log.warn('cfp.webhook.no_signature', { req_id: reqId });
    return NextResponse.json({ ok: false, reason: 'missing_signature' }, { status: 401 });
  }
  if (!verifySignature(rawBody, signature, secret)) {
    log.warn('cfp.webhook.sig_fail', {
      req_id: reqId, event_type: eventType, delivery_id: deliveryId.slice(0, 8),
    });
    return NextResponse.json({ ok: false, reason: 'invalid_signature' }, { status: 401 });
  }

  // Replay protection — drop deliveries with stale timestamps.
  if (timestamp) {
    const ts = Date.parse(timestamp);
    const drift = isNaN(ts) ? Infinity : Math.abs(Date.now() - ts);
    if (!isNaN(ts) && drift > REPLAY_WINDOW_MS) {
      log.warn('cfp.webhook.stale', {
        req_id: reqId, drift_ms: drift, event_type: eventType,
      });
      return NextResponse.json({ ok: false, reason: 'stale_timestamp' }, { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
    log.error('cfp.webhook.invalid_json', { req_id: reqId, event_type: eventType });
    return NextResponse.json({ ok: false, reason: 'invalid_json' }, { status: 400 });
  }

  const designId =
    typeof payload.designId === 'string'
      ? payload.designId
      : (typeof (payload.data as { designId?: unknown })?.designId === 'string'
          ? String((payload.data as { designId: string }).designId)
          : null);

  // Best-effort persist. Idempotent via UNIQUE on delivery_id.
  if (deliveryId) {
    const t = timer();
    try {
      const { error } = await supabaseAdmin
        .from('cfp_webhook_events')
        .insert({
          event_type: eventType,
          delivery_id: deliveryId,
          design_id: designId,
          payload,
        });
      if (error) {
        // Duplicate delivery_id or missing table — both non-fatal.
        log.warn('cfp.webhook.persist.fail', {
          req_id: reqId, event_type: eventType,
          delivery_id: deliveryId.slice(0, 8),
          duration_ms: t(), code: error.code, err: error.message,
        });
      } else {
        log.info('cfp.webhook.persist', {
          req_id: reqId, event_type: eventType,
          design_id: designId?.slice(0, 8), duration_ms: t(),
        });
      }
    } catch (e) {
      log.warn('cfp.webhook.persist.exception', {
        req_id: reqId, duration_ms: t(), err: e,
      });
    }
  }

  log.info('cfp.webhook.done', {
    req_id: reqId, event_type: eventType, duration_ms: elapsed(),
  });

  return NextResponse.json({ ok: true, deliveryId, requestId: reqId });
}

/**
 * GET — health-check. Returns whether the secret is configured without
 * leaking the secret itself.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.CFP_WEBHOOK_SECRET,
  });
}
