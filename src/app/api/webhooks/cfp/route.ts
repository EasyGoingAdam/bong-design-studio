import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Webhook receiver for the Customize Freeze Pipe app.
 *
 * Configure on customize-freezepipe.com/admin/settings:
 *   URL    → https://<this-app>/api/webhooks/cfp
 *   Events → design_submitted, status_changed, note_added
 *   Secret → set CFP_WEBHOOK_SECRET to the same value the admin shows on
 *            creation (it's only shown once)
 *
 * What it does:
 *   1. Verifies HMAC-SHA256 signature against raw body using the shared
 *      secret (constant-time comparison). 401 on mismatch.
 *   2. Rejects timestamps more than 5 minutes off (replay protection).
 *   3. Logs the event to a `cfp_webhook_events` Supabase table for audit.
 *      The table is best-effort — if the insert fails (table missing,
 *      Supabase down) the webhook still returns 200 so CFP doesn't keep
 *      logging failures upstream.
 *
 * Migration to run in Supabase if you want webhook history:
 *   create table cfp_webhook_events (
 *     id uuid primary key default gen_random_uuid(),
 *     event_type text not null,
 *     delivery_id text not null unique,  -- de-dupes accidental retries
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
  const secret = process.env.CFP_WEBHOOK_SECRET;
  if (!secret) {
    // Don't leak the misconfiguration to the caller — return 200 to avoid
    // upstream retry loops, but log loudly server-side.
    console.error('[cfp-webhook] CFP_WEBHOOK_SECRET not configured — rejecting');
    return NextResponse.json({ ok: false, reason: 'not_configured' }, { status: 503 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get('x-cfp-signature') || '';
  const timestamp = req.headers.get('x-cfp-timestamp') || '';
  const eventType = req.headers.get('x-cfp-event') || 'unknown';
  const deliveryId = req.headers.get('x-cfp-delivery-id') || '';

  if (!signature) {
    return NextResponse.json({ ok: false, reason: 'missing_signature' }, { status: 401 });
  }
  if (!verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ ok: false, reason: 'invalid_signature' }, { status: 401 });
  }
  // Replay protection — drop deliveries with stale timestamps.
  if (timestamp) {
    const ts = Date.parse(timestamp);
    if (!isNaN(ts) && Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
      return NextResponse.json({ ok: false, reason: 'stale_timestamp' }, { status: 401 });
    }
  }

  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody);
  } catch {
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
    try {
      await supabaseAdmin
        .from('cfp_webhook_events')
        .insert({
          event_type: eventType,
          delivery_id: deliveryId,
          design_id: designId,
          payload,
        });
    } catch (e) {
      // Table missing or duplicate delivery_id — both are non-fatal.
      console.warn('[cfp-webhook] persist failed:', e);
    }
  }

  return NextResponse.json({ ok: true, deliveryId });
}

/**
 * GET is mostly for health-checks. Returns whether the secret is configured
 * without leaking the secret itself.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: !!process.env.CFP_WEBHOOK_SECRET,
  });
}
