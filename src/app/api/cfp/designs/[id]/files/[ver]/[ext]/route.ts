import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: GET /api/cfp/designs/{id}/files/v{N}/design.{png|jpeg|svg}
 *
 * Streams raw image bytes from the CFP API to the browser without exposing
 * the bearer token. Used by the customer-designs drawer download buttons
 * and any local <img> usage that needs auth.
 *
 * URL shape: ../files/v3/png  →  upstream `/files/v3/design.png`
 * (We accept the extension as the last path segment; extension parsing is
 * stricter than the upstream's "design.{ext}" filename to keep our route
 * tree simple.)
 */
const VALID_EXT = new Set(['png', 'jpeg', 'jpg', 'svg']);

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; ver: string; ext: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }

  const { id, ver, ext } = await params;

  // Normalize "v3" → "3"; accept either form.
  const versionNumber = ver.replace(/^v/i, '');
  if (!/^\d+$/.test(versionNumber)) {
    return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
  }
  const cleanExt = ext.toLowerCase();
  if (!VALID_EXT.has(cleanExt)) {
    return NextResponse.json({ error: 'Invalid extension' }, { status: 400 });
  }

  const upstreamPath = `/designs/${encodeURIComponent(id)}/files/v${versionNumber}/design.${cleanExt}`;

  try {
    const upstream = await cfpFetch(upstreamPath);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status }
      );
    }
    // Stream the body through. Preserve content-type + filename from upstream
    // when available so save-as defaults to design-vN.png etc.
    const contentType = upstream.headers.get('content-type') || `image/${cleanExt}`;
    const disposition = upstream.headers.get('content-disposition') ||
      `inline; filename="design-v${versionNumber}.${cleanExt}"`;
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        // Allow the browser to cache rendered previews briefly.
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Stream failed' },
      { status: 502 }
    );
  }
}
