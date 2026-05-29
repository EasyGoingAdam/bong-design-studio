import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';
import { withLog, log, timer } from '@/lib/log';

/**
 * Generic image upload — accept a data URI + folder + filename, return the
 * public URL after storing in Supabase Storage. Used by the Presets tab's
 * "Upload Design" flow (sideload a finished design as a preset preview)
 * and any other surface that needs to persist a user-supplied image.
 *
 * Body shape:
 *   { data: "data:image/png;base64,…", folder?: "presets", filename?: "kushfather-preset" }
 *
 * - Rejects > 10 MB payloads (presets are previews, not master files).
 * - Storage upload failures fall back to inline base64 so the upload UI
 *   keeps working even when storage is sick — the caller can still use
 *   the resulting data URI as a preview, just not as a long-lived URL.
 */

interface Body {
  data: string;
  folder?: string;
  filename?: string;
}

const MAX_BYTES = 10 * 1024 * 1024;

export const POST = withLog('upload_image', async (req: NextRequest) => {
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  if (!body.data || typeof body.data !== 'string') {
    return NextResponse.json({ error: 'data (base64 string) required' }, { status: 400 });
  }
  if (!body.data.startsWith('data:')) {
    return NextResponse.json({ error: 'data must be a data:… URI' }, { status: 400 });
  }
  // Rough byte estimate from the base64 payload size (length × 3/4).
  const base64Body = body.data.split(',')[1] || '';
  const estimatedBytes = Math.ceil(base64Body.length * 0.75);
  if (estimatedBytes > MAX_BYTES) {
    log.warn('upload_image.too_large', { bytes: estimatedBytes });
    return NextResponse.json(
      { error: `Image too large (max ${Math.round(MAX_BYTES / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }

  const folder = (body.folder || 'uploads').replace(/[^a-z0-9-_]/gi, '') || 'uploads';
  const filename = (body.filename || `upload-${Date.now()}`)
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 60);

  const t = timer();
  try {
    const url = await uploadImage(body.data, folder, filename);
    log.info('upload_image.ok', { folder, filename, bytes: estimatedBytes, duration_ms: t() });
    return NextResponse.json({ url, bytes: estimatedBytes });
  } catch (err) {
    log.error('upload_image.fail', { folder, filename, duration_ms: t(), err });
    return NextResponse.json({
      url: body.data,
      bytes: estimatedBytes,
      warning: 'storage_upload_failed_returning_inline',
    });
  }
});
