import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';
import { withLog, log, timer } from '@/lib/log';

/**
 * POST /api/xl-piece
 *
 * Produces an "XL piece" version of an engraving design by extending the
 * canvas vertically while preserving the original artwork EXACTLY. No AI
 * involved — pure deterministic sharp resize + pad. This replaces the
 * previous approach that ran the source through gpt-image-1 edit and
 * caused the model to duplicate the design on top of itself.
 *
 * Behavior:
 *   - Input image is centered on a taller canvas
 *   - Background color matches the source's nearest edge color (auto-
 *     detected) so the extension blends with engraving aesthetics
 *     (typically white for B&W designs)
 *   - Default target ratio is 2:3 portrait (1024×1536) — the "XL piece"
 *     size we standardized on previously
 *   - Original artwork is NEVER stretched, recomposed, or duplicated
 *
 * Body:
 *   { imageUrl, targetWidth?, targetHeight?, background?, folder?, filename? }
 */

interface Body {
  imageUrl: string;
  targetWidth?: number;
  targetHeight?: number;
  background?: 'white' | 'black' | 'auto';
  folder?: string;
  filename?: string;
}

async function fetchBuffer(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    const m = src.match(/^data:[^;]+;base64,(.+)$/);
    if (!m) throw new Error('Invalid data URI');
    return Buffer.from(m[1], 'base64');
  }
  const r = await fetch(src);
  if (!r.ok) throw new Error(`Could not fetch source image (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

export const POST = withLog('xl_piece.extend', async (req: NextRequest) => {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
  }

  const targetWidth = body.targetWidth ?? 1024;
  const targetHeight = body.targetHeight ?? 1536;
  const backgroundPref = body.background ?? 'auto';

  // 1. Pull the source image
  const tFetch = timer();
  let sourceBuf: Buffer;
  try {
    sourceBuf = await fetchBuffer(body.imageUrl);
    log.info('xl_piece.source_fetched', {
      bytes: sourceBuf.length, duration_ms: tFetch(),
    });
  } catch (e) {
    log.error('xl_piece.source_fetch_fail', { duration_ms: tFetch(), err: e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to fetch source image' },
      { status: 502 }
    );
  }

  const sharp = (await import('sharp')).default;

  // 2. Decide the background color. For most B&W laser designs the user
  // expects white — but if a design has a black background we shouldn't
  // pad with white. Sample the average color of the source's outer border
  // to pick automatically.
  let bgR = 255, bgG = 255, bgB = 255;
  if (backgroundPref === 'black') {
    bgR = 0; bgG = 0; bgB = 0;
  } else if (backgroundPref === 'auto') {
    try {
      const stats = await sharp(sourceBuf)
        .extract({ left: 0, top: 0, width: 4, height: 4 })
        .stats();
      const r = stats.channels[0]?.mean ?? 255;
      const g = stats.channels[1]?.mean ?? 255;
      const b = stats.channels[2]?.mean ?? 255;
      const luma = 0.299 * r + 0.587 * g + 0.114 * b;
      // Snap to pure black or pure white — anything else looks wrong on
      // an engraving design.
      if (luma < 128) { bgR = 0; bgG = 0; bgB = 0; }
    } catch (e) {
      log.warn('xl_piece.bg_detect_fail', { err: e });
    }
  }

  // 3. Scale the source to fit INSIDE the target without distortion.
  // `fit: 'inside'` preserves aspect; then we extend with bg to the exact
  // target dimensions. The original artwork is centered.
  const tCompose = timer();
  let composed: Buffer;
  try {
    // BUG FIX: was running .resize→.extend(zeros)→.resize. The middle
    // .extend with all zero edges was dead code (sharp ignored it). A
    // single .resize(fit:'contain') already produces exact target
    // dims, padding with the background color — that's the canonical
    // "extend canvas" operation.
    composed = await sharp(sourceBuf)
      .resize(targetWidth, targetHeight, {
        fit: 'contain',
        background: { r: bgR, g: bgG, b: bgB, alpha: 1 },
      })
      .png({ compressionLevel: 8 })
      .toBuffer();
    log.info('xl_piece.composed', {
      target_w: targetWidth, target_h: targetHeight,
      bg: `${bgR},${bgG},${bgB}`, bytes: composed.length,
      duration_ms: tCompose(),
    });
  } catch (e) {
    log.error('xl_piece.compose_fail', { duration_ms: tCompose(), err: e });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed to compose XL canvas' },
      { status: 500 }
    );
  }

  // 4. Upload to Supabase Storage and return the public URL.
  const filename = body.filename || `xl-${Date.now()}`;
  const folder = body.folder || 'xl';
  const dataUri = `data:image/png;base64,${composed.toString('base64')}`;

  const tUpload = timer();
  try {
    const url = await uploadImage(dataUri, folder, filename);
    log.info('xl_piece.uploaded', { duration_ms: tUpload() });
    return NextResponse.json({
      url,
      width: targetWidth,
      height: targetHeight,
      background: { r: bgR, g: bgG, b: bgB },
    });
  } catch (e) {
    log.error('xl_piece.upload_fail', { duration_ms: tUpload(), err: e });
    // Fall back to inlining the base64 so the user still gets the image —
    // they can right-click save even if storage is sick.
    return NextResponse.json({
      url: dataUri,
      width: targetWidth,
      height: targetHeight,
      background: { r: bgR, g: bgG, b: bgB },
      warning: 'storage_upload_failed_returning_inline',
    });
  }
});
