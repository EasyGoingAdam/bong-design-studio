import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin } from '@/lib/supabase';
import { traceToSvg } from '@/lib/trace-svg';

export const maxDuration = 120;

async function loadBytes(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

function safeName(s: string): string {
  return (s || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'design';
}

/**
 * GET /api/studio/export?versionId=&format=svg|png|jpg&name=
 * Returns the production file bytes for download.
 *  - svg: TRUE vector via Potrace (falls back to raster-in-SVG; X-Svg-Kind header
 *    says which). png: the binary master as-is. jpg: flattened JPEG.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const versionId = sp.get('versionId') || '';
    const format = (sp.get('format') || 'png').toLowerCase();
    const name = safeName(sp.get('name') || 'design');
    const wIn = parseFloat(sp.get('wIn') || '') || 0;
    const hIn = parseFloat(sp.get('hIn') || '') || 0;
    if (!versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 });

    const { data: v } = await supabaseAdmin.from('design_versions').select('image_url').eq('id', versionId).maybeSingle();
    if (!v?.image_url) return NextResponse.json({ error: 'version has no image' }, { status: 404 });
    const master = await loadBytes(v.image_url);

    if (format === 'png') {
      const png = await sharp(master).png().toBuffer();
      return fileResponse(png, 'image/png', `${name}.png`);
    }
    if (format === 'jpg' || format === 'jpeg') {
      const jpg = await sharp(master).flatten({ background: '#ffffff' }).jpeg({ quality: 95 }).toBuffer();
      return fileResponse(jpg, 'image/jpeg', `${name}.jpg`);
    }
    // svg
    try {
      const { svg } = await traceToSvg(master);
      return fileResponse(Buffer.from(withPhysicalSize(svg, wIn, hIn), 'utf8'), 'image/svg+xml', `${name}.svg`, { 'X-Svg-Kind': 'vector' });
    } catch (err) {
      console.warn('[studio/export] vector trace failed, embedding raster:', err instanceof Error ? err.message : err);
      const meta = await sharp(master).metadata();
      const b64 = (await sharp(master).png().toBuffer()).toString('base64');
      const w = meta.width ?? 1024, h = meta.height ?? 1024;
      const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><image width="${w}" height="${h}" xlink:href="data:image/png;base64,${b64}"/></svg>`;
      return fileResponse(Buffer.from(withPhysicalSize(svg, wIn, hIn), 'utf8'), 'image/svg+xml', `${name}.svg`, { 'X-Svg-Kind': 'embedded' });
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 500 });
  }
}

/**
 * Stamp real physical size onto an SVG so the laser software imports it at the
 * correct inches. Keeps a pixel viewBox for geometry; sets width/height in `in`.
 */
function withPhysicalSize(svg: string, wIn: number, hIn: number): string {
  if (!wIn || !hIn) return svg;
  const openMatch = svg.match(/<svg\b[^>]*>/);
  if (!openMatch) return svg;
  let tag = openMatch[0];
  const wPx = tag.match(/\bwidth="([\d.]+)(?:px)?"/)?.[1];
  const hPx = tag.match(/\bheight="([\d.]+)(?:px)?"/)?.[1];
  // Ensure a viewBox exists (fall back to the pixel dimensions).
  if (!/viewBox=/.test(tag) && wPx && hPx) {
    tag = tag.replace(/<svg\b/, `<svg viewBox="0 0 ${wPx} ${hPx}"`);
  }
  tag = tag.replace(/\bwidth="[^"]*"/, `width="${wIn}in"`).replace(/\bheight="[^"]*"/, `height="${hIn}in"`);
  if (!/\bwidth=/.test(tag)) tag = tag.replace(/<svg\b/, `<svg width="${wIn}in" height="${hIn}in"`);
  return svg.replace(openMatch[0], tag);
}

function fileResponse(buf: Buffer, contentType: string, filename: string, extra: Record<string, string> = {}): NextResponse {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      ...extra,
    },
  });
}
