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
 * The external tool (e.g. your customer-facing design app) calls this to
 * push a completed design into the studio as a new concept ready for the
 * team to work on.
 *
 * Body (all optional unless noted):
 *   name                   — string, required
 *   description            — string
 *   collection             — string
 *   tags                   — string[]
 *   intendedAudience       — string
 *   priority               — 'low'|'medium'|'high'|'urgent' (default medium)
 *   lifecycleType          — 'seasonal'|'evergreen'|'limited_edition'|'custom'
 *   coilOnly               — boolean (default false)
 *   coilImageUrl           — public http(s) URL
 *   coilImageBase64        — data URI (we'll upload to storage)
 *   baseImageUrl           — public http(s) URL (ignored when coilOnly)
 *   baseImageBase64        — data URI (ignored when coilOnly)
 *   source                 — string identifying your tool (required for
 *                             idempotency). E.g. 'custom-designer-v1'.
 *   externalId             — your tool's ID for this design. Required for
 *                             idempotency — resubmitting with the same
 *                             (source, externalId) pair UPDATES the
 *                             existing concept rather than creating a
 *                             duplicate.
 *   externalUrl            — deep link back to the design in your tool
 *   submitterEmail         — end-user who designed it
 *   submitterName          — end-user display name
 *   notes                  — free-text notes (stored in manufacturingNotes
 *                             by default — use the concept UI to relocate)
 *   dimensions             — { overallW, overallH, coilW, coilH, baseW,
 *                               baseH, unit } (optional)
 *
 * Response:
 *   200 on update (idempotent replay) or create:
 *   {
 *     id: "concept-uuid",
 *     url: "https://<APP_URL>/concept/<id>",
 *     status: "ideation",
 *     created: true | false,    // true on first submission
 *     createdAt: "ISO",
 *     updatedAt: "ISO"
 *   }
 *
 * Auth:
 *   Requires INCOMING_API_KEY env var set server-side. The caller sends it
 *   as a Bearer token. If the env var isn't set, the endpoint refuses all
 *   requests (fail-closed).
 */

interface Body {
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

export async function POST(request: NextRequest) {
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
  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const source = (body.source || '').trim();
  const externalId = (body.externalId || '').trim();

  try {
    // ---- Upload base64 images to storage if provided ----
    // We accept both URL (we just store it) and base64 (we upload to our
    // own storage so the image survives even if the source tool goes away).
    const folder = 'incoming';
    const fnBase = (externalId || source || body.name).replace(/[^a-zA-Z0-9\-_]/g, '-').slice(0, 40);

    let coilImageUrl = body.coilImageUrl || '';
    if (!coilImageUrl && body.coilImageBase64) {
      try {
        coilImageUrl = await uploadImage(body.coilImageBase64, folder, `${fnBase}-coil`);
      } catch (err) {
        console.error('Failed to upload incoming coil image:', err);
        return NextResponse.json({ error: 'Failed to upload coil image' }, { status: 500 });
      }
    }

    let baseImageUrl = body.coilOnly ? '' : (body.baseImageUrl || '');
    if (!body.coilOnly && !baseImageUrl && body.baseImageBase64) {
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
      name: body.name.trim(),
      collection: body.collection?.trim() || '',
      status: 'ideation',
      designer: body.submitterName?.trim() || 'External Submission',
      tags: body.tags ?? [],
      description: body.description?.trim() || '',
      intended_audience: body.intendedAudience?.trim() || '',
      manufacturing_notes: body.notes?.trim() || '',
      coil_image_url: coilImageUrl,
      base_image_url: baseImageUrl,
      combined_image_url: '',
      priority: body.priority || 'medium',
      lifecycle_type: body.lifecycleType || 'evergreen',
      coil_only: !!body.coilOnly,
      source,
      external_id: externalId,
      external_url: body.externalUrl || '',
      submitter_email: body.submitterEmail?.trim() || '',
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
        status: 'ideation',
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
    acceptedFields: [
      'name', 'description', 'collection', 'tags', 'intendedAudience', 'priority',
      'lifecycleType', 'coilOnly', 'coilImageUrl', 'coilImageBase64', 'baseImageUrl',
      'baseImageBase64', 'source', 'externalId', 'externalUrl', 'submitterEmail',
      'submitterName', 'notes', 'dimensions',
    ],
  });
}
