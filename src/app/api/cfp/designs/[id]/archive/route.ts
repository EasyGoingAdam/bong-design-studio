import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';

/**
 * POST /api/cfp/designs/{id}/archive
 *
 * Archives a CFP customer design into OUR Supabase Storage. Returns a
 * permanent URL we own. This is what the "Import to Concepts" flow
 * should call instead of using the runtime CFP proxy URL directly —
 * otherwise:
 *   - rotating CFP_API_KEY breaks every imported concept's image
 *   - deleting a version upstream breaks our concept's image
 *   - the customer's original design isn't truly "archived" with us
 *
 * Body shape:
 *   { version?: number, format?: 'png' | 'jpeg' | 'svg' }
 *   Defaults to the customer-selected version + png.
 *
 * Response:
 *   200 { ok: true, url: 'https://…/storage/v1/object/public/…', bytes, version, format }
 *   404 { error: 'Design or version not found' }
 *   502 { error: 'Upstream fetch failed' }
 */

type ArchiveBody = { version?: number; format?: 'png' | 'jpeg' | 'svg' };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as ArchiveBody;
  const format = body.format ?? 'png';

  // 1. Resolve which version to archive. If the caller didn't pass one,
  //    pull the design's selectedVersion from the CFP API.
  let versionNumber = body.version;
  if (!versionNumber) {
    try {
      const designRes = await cfpFetch(`/designs/${encodeURIComponent(id)}`);
      if (!designRes.ok) {
        return NextResponse.json(
          { error: `Could not load design (${designRes.status})` },
          { status: designRes.status }
        );
      }
      const designData = await designRes.json() as { design?: { selectedVersion?: { versionNumber: number }; allVersions?: { versionNumber: number }[] } };
      versionNumber =
        designData.design?.selectedVersion?.versionNumber ??
        designData.design?.allVersions?.[0]?.versionNumber;
      if (!versionNumber) {
        return NextResponse.json({ error: 'Design has no versions' }, { status: 404 });
      }
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to resolve version' },
        { status: 502 }
      );
    }
  }

  // 2. Fetch the image bytes server-side through the bearer-authed CFP
  //    upstream. Never goes near the browser.
  let bytes: ArrayBuffer;
  try {
    const fileRes = await cfpFetch(
      `/designs/${encodeURIComponent(id)}/files/v${versionNumber}/design.${format}`
    );
    if (!fileRes.ok) {
      return NextResponse.json(
        { error: `Upstream image fetch failed (${fileRes.status})` },
        { status: fileRes.status }
      );
    }
    bytes = await fileRes.arrayBuffer();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Image fetch failed' },
      { status: 502 }
    );
  }

  // 3. Upload to OUR Supabase Storage. Path uses cfp-imports/ as the
  //    top-level folder so we can audit + GC them separately later if we
  //    want. Filename includes design id + version so retries upsert
  //    idempotently rather than collide.
  const contentType =
    format === 'png'  ? 'image/png'
    : format === 'jpeg' ? 'image/jpeg'
    : 'image/svg+xml';
  const path = `cfp-imports/${id}/v${versionNumber}.${format}`;

  const { error: upErr } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, new Uint8Array(bytes), { contentType, upsert: true });

  if (upErr) {
    return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 });
  }

  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return NextResponse.json({
    ok: true,
    url: pub.publicUrl,
    bytes: bytes.byteLength,
    version: versionNumber,
    format,
  });
}
