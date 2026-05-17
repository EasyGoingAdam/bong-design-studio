import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';
import { withLog, log, timer } from '@/lib/log';

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
 * Body shape: { version?: number, format?: 'png' | 'jpeg' | 'svg' }
 * Defaults: selected version + png.
 *
 * The op runs in 3 steps and each one logs duration / outcome so a
 * stuck import can be diagnosed without re-running.
 */

type ArchiveBody = { version?: number; format?: 'png' | 'jpeg' | 'svg' };

export const POST = withLog<{ id: string }>('cfp.archive', async (
  req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const designIdShort = id.slice(0, 8);
  const body = (await req.json().catch(() => ({}))) as ArchiveBody;
  const format = body.format ?? 'png';
  let versionNumber = body.version;

  /* ────────── Step 1: resolve version if not provided ────────── */
  if (!versionNumber) {
    const t = timer();
    try {
      const designRes = await cfpFetch(`/designs/${encodeURIComponent(id)}`);
      if (!designRes.ok) {
        log.error('cfp.archive.resolve_version.upstream_fail', {
          design_id: designIdShort, status: designRes.status, duration_ms: t(),
        });
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
        log.warn('cfp.archive.no_versions', { design_id: designIdShort });
        return NextResponse.json({ error: 'Design has no versions' }, { status: 404 });
      }
      log.info('cfp.archive.resolve_version', {
        design_id: designIdShort, version: versionNumber, duration_ms: t(),
      });
    } catch (e) {
      log.error('cfp.archive.resolve_version.network', {
        design_id: designIdShort, duration_ms: t(), err: e,
      });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Failed to resolve version' },
        { status: 502 }
      );
    }
  }

  /* ────────── Step 2: fetch image bytes from upstream ────────── */
  let bytes: ArrayBuffer;
  {
    const t = timer();
    try {
      const fileRes = await cfpFetch(
        `/designs/${encodeURIComponent(id)}/files/v${versionNumber}/design.${format}`
      );
      if (!fileRes.ok) {
        log.error('cfp.archive.fetch_image.fail', {
          design_id: designIdShort, version: versionNumber, format,
          status: fileRes.status, duration_ms: t(),
        });
        return NextResponse.json(
          { error: `Upstream image fetch failed (${fileRes.status})` },
          { status: fileRes.status }
        );
      }
      bytes = await fileRes.arrayBuffer();
      log.info('cfp.archive.fetch_image', {
        design_id: designIdShort, version: versionNumber, format,
        bytes: bytes.byteLength, duration_ms: t(),
      });
    } catch (e) {
      log.error('cfp.archive.fetch_image.network', {
        design_id: designIdShort, duration_ms: t(), err: e,
      });
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Image fetch failed' },
        { status: 502 }
      );
    }
  }

  /* ────────── Step 3: upload to our Supabase Storage ────────── */
  const contentType =
    format === 'png'  ? 'image/png'
    : format === 'jpeg' ? 'image/jpeg'
    : 'image/svg+xml';
  const path = `cfp-imports/${id}/v${versionNumber}.${format}`;
  {
    const t = timer();
    const { error: upErr } = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(path, new Uint8Array(bytes), { contentType, upsert: true });

    if (upErr) {
      log.error('cfp.archive.upload.fail', {
        design_id: designIdShort, path, duration_ms: t(), err: upErr.message,
      });
      return NextResponse.json({ error: `Storage upload failed: ${upErr.message}` }, { status: 500 });
    }
    log.info('cfp.archive.upload', {
      design_id: designIdShort, path, bytes: bytes.byteLength, duration_ms: t(),
    });
  }

  const { data: pub } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(path);
  log.info('cfp.archive.complete', {
    design_id: designIdShort, version: versionNumber, url_host: new URL(pub.publicUrl).host,
  });

  return NextResponse.json({
    ok: true,
    url: pub.publicUrl,
    bytes: bytes.byteLength,
    version: versionNumber,
    format,
  });
});
