import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin, uploadImage } from '@/lib/supabase';

/**
 * Inbound submission endpoint for external design tools.
 *
 * POST /api/incoming/concept
 * Headers:
 *   Authorization: Bearer <INCOMING_API_KEY>
 *   Content-Type: application/json
 *
 * MINIMAL call (the common case — a customer finishes a design in the
 * external tool and pushes it in as a ready-to-manufacture listing):
 *
 *   {
 *     "graphic": "data:image/png;base64,..." | "https://...",
 *     "name":    "Customer Dragon Design",
 *     "email":   "alex@example.com"
 *   }
 *
 * That's it — the concept lands in the **Approved** column (ready for the
 * team to move straight to manufacturing) as a coil-only design, with the
 * supplied graphic as its primary image and the email saved as the
 * submitter contact.
 *
 * FULL shape (when the external tool tracks more metadata):
 *
 *   graphic / graphicUrl / graphicBase64  — shorthand for the main image.
 *       When supplied, the concept is coil-only by default and this image
 *       becomes the coil image. Pass one of:
 *         graphic          — auto-detected (URL if starts with 'http',
 *                             otherwise treated as base64)
 *         graphicUrl       — public http(s) URL
 *         graphicBase64    — 'data:image/png;base64,...'
 *   coilImageUrl / coilImageBase64  — explicit coil image when your tool
 *       distinguishes coil vs base
 *   baseImageUrl / baseImageBase64  — explicit base image (ignored when
 *       coilOnly is true or only `graphic` is sent)
 *   coilOnly          — boolean; auto-set to true when `graphic` is sent
 *       without separate base images
 *
 *   name / designName        — required (use either field)
 *   email / submitterEmail   — end customer's email
 *   submitterName            — end customer's display name
 *
 *   description, collection, tags, intendedAudience, priority,
 *   lifecycleType, externalId, externalUrl, source, notes, dimensions
 *       — same semantics as before (see INCOMING_API.md)
 *
 *   status  — optional override. Defaults to 'approved'. Pass
 *       'ideation' / 'in_review' / 'approved' / 'ready_for_manufacturing'
 *
 * Response:
 *   201 on create or 200 on update:
 *   {
 *     id: "concept-uuid",
 *     url: "https://<APP_URL>/?conceptId=...",
 *     status: "approved",
 *     created: true | false,
 *     createdAt: "ISO",
 *     updatedAt: "ISO"
 *   }
 *
 * Auth:
 *   Requires INCOMING_API_KEY env var. Bearer token. Fail-closed if unset.
 */

type AllowedStatus = 'ideation' | 'in_review' | 'approved' | 'ready_for_manufacturing';

interface Body {
  // Simplified aliases — the preferred shape for most callers
  graphic?: string;        // auto-detect URL vs base64
  graphicUrl?: string;
  graphicBase64?: string;
  designName?: string;     // alias for name
  email?: string;          // alias for submitterEmail

  // Full shape (still supported)
  name?: string;
  description?: string;
  collection?: string;
  tags?: string[];
  intendedAudience?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  lifecycleType?: 'seasonal' | 'evergreen' | 'limited_edition' | 'custom';
  coilOnly?: boolean;
  coilImageUrl?: string;
  coilImageBase64?: string;
  baseImageUrl?: string;
  baseImageBase64?: string;
  source?: string;
  externalId?: string;
  externalUrl?: string;
  submitterEmail?: string;
  submitterName?: string;
  notes?: string;
  /** Optional override — defaults to 'approved' for incoming submissions */
  status?: AllowedStatus;
  dimensions?: {
    overallW?: number | string;
    overallH?: number | string;
    coilW?: number | string;
    coilH?: number | string;
    baseW?: number | string;
    baseH?: number | string;
    unit?: 'mm' | 'in';
  };
}

function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * SHELVED. The incoming-submissions feature is intentionally disabled and
 * gated behind the INCOMING_API_ENABLED env var. To turn it back on:
 *   1. Set INCOMING_API_ENABLED=true in Railway → Variables
 *   2. Set INCOMING_API_KEY to a strong shared secret
 *   3. Redeploy
 * The route returns 410 Gone when shelved so callers see a clear,
 * non-retryable signal instead of a vague 401/503.
 */
function shelvedResponse() {
  return NextResponse.json(
    {
      error: 'Incoming submissions are currently disabled.',
      hint: 'Set INCOMING_API_ENABLED=true on the server to re-enable.',
    },
    { status: 410 }
  );
}

function isEnabled(): boolean {
  return process.env.INCOMING_API_ENABLED === 'true';
}

export async function POST(request: NextRequest) {
  if (!isEnabled()) return shelvedResponse();

  // ---- Auth ----
  const expected = process.env.INCOMING_API_KEY;
  if (!expected) {
    // Fail closed: if the operator hasn't set the key, refuse rather than
    // silently accepting unauthenticated writes.
    return NextResponse.json(
      { error: 'INCOMING_API_KEY env var not configured on the server. Set it in Railway / Vercel and redeploy.' },
      { status: 503 }
    );
  }
  const header = request.headers.get('authorization') || '';
  const provided = header.replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== expected) return unauthorized();

  // ---- Parse + validate ----
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Name is required — accept `name` or the alias `designName`
  const name = (body.name || body.designName || '').trim();
  if (!name) {
    return NextResponse.json(
      { error: '`name` (or `designName`) is required' },
      { status: 400 }
    );
  }

  // Resolve the main graphic. Simplified shape collapses three optional
  // fields into one: `graphic` auto-detects url-vs-base64 from the prefix.
  let graphicUrl = body.graphicUrl || '';
  let graphicBase64 = body.graphicBase64 || '';
  if (body.graphic && !graphicUrl && !graphicBase64) {
    if (body.graphic.startsWith('http://') || body.graphic.startsWith('https://')) {
      graphicUrl = body.graphic;
    } else if (body.graphic.startsWith('data:')) {
      graphicBase64 = body.graphic;
    } else {
      return NextResponse.json(
        { error: '`graphic` must be an http(s) URL or a data: URI' },
        { status: 400 }
      );
    }
  }

  // Email alias
  const submitterEmail = (body.submitterEmail || body.email || '').trim();

  const source = (body.source || '').trim();
  const externalId = (body.externalId || '').trim();

  // Decide if this is a coil-only submission. Caller can override, but the
  // natural default for the simplified shape (single `graphic` with no
  // explicit base image) is coil-only.
  const hasExplicitBase = !!(body.baseImageUrl || body.baseImageBase64);
  const hasGraphic = !!graphicUrl || !!graphicBase64;
  const coilOnly =
    typeof body.coilOnly === 'boolean'
      ? body.coilOnly
      : hasGraphic && !hasExplicitBase;

  // Default status is 'approved' — external submissions are finished
  // designs going straight to the team's action queue. Caller can override.
  const VALID_STATUSES: AllowedStatus[] = ['ideation', 'in_review', 'approved', 'ready_for_manufacturing'];
  const status: AllowedStatus = VALID_STATUSES.includes(body.status as AllowedStatus)
    ? (body.status as AllowedStatus)
    : 'approved';

  try {
    // ---- Upload base64 images to storage if provided ----
    const folder = 'incoming';
    const fnBase = (externalId || source || name).replace(/[^a-zA-Z0-9\-_]/g, '-').slice(0, 40);

    // Coil image — prefer explicit coilImageUrl/Base64, then fall back to
    // the simplified `graphic*` fields.
    let coilImageUrl = body.coilImageUrl || graphicUrl || '';
    const coilBase64 = body.coilImageBase64 || graphicBase64 || '';
    if (!coilImageUrl && coilBase64) {
      try {
        coilImageUrl = await uploadImage(coilBase64, folder, `${fnBase}-coil`);
      } catch (err) {
        console.error('Failed to upload incoming coil image:', err);
        return NextResponse.json({ error: 'Failed to upload coil image' }, { status: 500 });
      }
    }

    let baseImageUrl = coilOnly ? '' : (body.baseImageUrl || '');
    if (!coilOnly && !baseImageUrl && body.baseImageBase64) {
      try {
        baseImageUrl = await uploadImage(body.baseImageBase64, folder, `${fnBase}-base`);
      } catch (err) {
        console.error('Failed to upload incoming base image:', err);
        return NextResponse.json({ error: 'Failed to upload base image' }, { status: 500 });
      }
    }

    // ---- Idempotency — find existing by (source, external_id) ----
    let existingId: string | null = null;
    if (source && externalId) {
      const { data: existing } = await supabaseAdmin
        .from('concepts')
        .select('id')
        .eq('source', source)
        .eq('external_id', externalId)
        .maybeSingle();
      if (existing?.id) existingId = existing.id;
    }

    const nowIso = new Date().toISOString();

    // ---- Build the concept record ----
    const conceptFields = {
      name,
      collection: body.collection?.trim() || '',
      status,
      designer: body.submitterName?.trim() || submitterEmail || 'External Submission',
      tags: body.tags ?? [],
      description: body.description?.trim() || '',
      intended_audience: body.intendedAudience?.trim() || '',
      manufacturing_notes: body.notes?.trim() || '',
      coil_image_url: coilImageUrl,
      base_image_url: baseImageUrl,
      combined_image_url: '',
      priority: body.priority || 'medium',
      lifecycle_type: body.lifecycleType || 'evergreen',
      coil_only: coilOnly,
      source,
      external_id: externalId,
      external_url: body.externalUrl || '',
      submitter_email: submitterEmail,
      submitter_name: body.submitterName?.trim() || '',
      updated_at: nowIso,
    };

    let conceptId: string;
    let created = false;
    let createdAt: string;

    if (existingId) {
      // UPDATE — idempotent replay
      const { data, error } = await supabaseAdmin
        .from('concepts')
        .update(conceptFields)
        .eq('id', existingId)
        .select('id, created_at, updated_at')
        .single();
      if (error || !data) {
        console.error('Incoming concept update failed:', error);
        return NextResponse.json({ error: error?.message || 'Update failed' }, { status: 500 });
      }
      conceptId = data.id;
      createdAt = data.created_at;
    } else {
      // INSERT new
      conceptId = uuidv4();
      const { data, error } = await supabaseAdmin
        .from('concepts')
        .insert({
          id: conceptId,
          ...conceptFields,
          created_at: nowIso,
        })
        .select('id, created_at, updated_at')
        .single();
      if (error || !data) {
        console.error('Incoming concept insert failed:', error);
        return NextResponse.json({ error: error?.message || 'Insert failed' }, { status: 500 });
      }
      conceptId = data.id;
      createdAt = data.created_at;
      created = true;
    }

    // ---- Store dimensions on coilSpecs / baseSpecs if provided ----
    if (body.dimensions) {
      const d = body.dimensions;
      const unit = d.unit || 'mm';
      const coilDim = d.coilW && d.coilH ? `${d.coilW} x ${d.coilH} ${unit}` : '';
      const baseDim = d.baseW && d.baseH ? `${d.baseW} x ${d.baseH} ${unit}` : '';
      if (coilDim || baseDim) {
        // Coil/base specs live in their own table per the existing data
        // model. Easiest: best-effort upsert here; don't fail the request
        // if it hiccups.
        try {
          if (coilDim) {
            await supabaseAdmin
              .from('coil_specs')
              .upsert({ concept_id: conceptId, dimensions: coilDim }, { onConflict: 'concept_id' });
          }
          if (baseDim && !body.coilOnly) {
            await supabaseAdmin
              .from('base_specs')
              .upsert({ concept_id: conceptId, dimensions: baseDim }, { onConflict: 'concept_id' });
          }
        } catch (err) {
          console.warn('Dimension upsert warning (non-fatal):', err);
        }
      }
    }

    // Build a user-navigable URL. NEXT_PUBLIC_APP_URL is already set for
    // other features; we fall back to the request origin as a reasonable
    // default.
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin;
    const conceptUrl = `${appUrl}/?conceptId=${conceptId}`;

    return NextResponse.json(
      {
        id: conceptId,
        url: conceptUrl,
        status,
        coilOnly,
        created,
        createdAt,
        updatedAt: nowIso,
      },
      { status: created ? 201 : 200 }
    );
  } catch (err) {
    console.error('Incoming concept error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to accept submission' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/incoming/concept — health check that also verifies auth.
 * Useful for the external tool to confirm connectivity + key validity
 * before sending real submissions.
 */
export async function GET(request: NextRequest) {
  if (!isEnabled()) return shelvedResponse();

  const expected = process.env.INCOMING_API_KEY;
  if (!expected) {
    return NextResponse.json({ ok: false, error: 'INCOMING_API_KEY not configured' }, { status: 503 });
  }
  const header = request.headers.get('authorization') || '';
  const provided = header.replace(/^Bearer\s+/i, '').trim();
  if (!provided || provided !== expected) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    ok: true,
    ready: true,
    endpoint: '/api/incoming/concept',
    defaultStatus: 'approved',
    minimalShape: {
      graphic: '<url or data-URI>',
      name: '<design name>',
      email: '<submitter email>',
    },
    acceptedFields: [
      // Simplified
      'graphic', 'graphicUrl', 'graphicBase64', 'designName', 'email',
      // Full
      'name', 'description', 'collection', 'tags', 'intendedAudience', 'priority',
      'lifecycleType', 'coilOnly', 'coilImageUrl', 'coilImageBase64', 'baseImageUrl',
      'baseImageBase64', 'source', 'externalId', 'externalUrl', 'submitterEmail',
      'submitterName', 'notes', 'dimensions', 'status',
    ],
  });
}
