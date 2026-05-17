import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { withLog, log } from '@/lib/log';

/**
 * Proxy: GET /api/cfp/designs/{id}/files/v{N}/design.{png|jpeg|svg}
 *
 * Streams raw image bytes from the CFP API to the browser without
 * exposing the bearer token. Range request headers (RFC 7233) are
 * forwarded so the browser can do partial downloads of large SVGs.
 */
const VALID_EXT = new Set(['png', 'jpeg', 'jpg', 'svg']);

export const GET = withLog<{ id: string; ver: string; ext: string }>(
  'cfp.files.stream',
  async (req: NextRequest, { params }) => {
    if (!getCfpConfig()) {
      return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
    }

    const { id, ver, ext } = await params;

    // Normalize "v3" → "3"; accept either form.
    const versionNumber = ver.replace(/^v/i, '');
    if (!/^\d+$/.test(versionNumber)) {
      log.warn('cfp.files.stream.bad_version', { ver });
      return NextResponse.json({ error: 'Invalid version number' }, { status: 400 });
    }
    const cleanExt = ext.toLowerCase();
    if (!VALID_EXT.has(cleanExt)) {
      log.warn('cfp.files.stream.bad_ext', { ext });
      return NextResponse.json({ error: 'Invalid extension' }, { status: 400 });
    }

    const upstreamPath = `/designs/${encodeURIComponent(id)}/files/v${versionNumber}/design.${cleanExt}`;

    // Forward Range header for partial-content requests.
    const rangeHeader = req.headers.get('range');
    const initHeaders: Record<string, string> = {};
    if (rangeHeader) initHeaders['Range'] = rangeHeader;

    try {
      const upstream = await cfpFetch(upstreamPath, { headers: initHeaders });
      if (!upstream.ok && upstream.status !== 206) {
        return NextResponse.json(
          { error: `Upstream ${upstream.status}` },
          { status: upstream.status }
        );
      }
      const contentType = upstream.headers.get('content-type') || `image/${cleanExt}`;
      const disposition = upstream.headers.get('content-disposition') ||
        `inline; filename="design-v${versionNumber}.${cleanExt}"`;
      const responseHeaders: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        'Cache-Control': 'private, max-age=60',
      };
      const acceptRanges = upstream.headers.get('accept-ranges');
      if (acceptRanges) responseHeaders['Accept-Ranges'] = acceptRanges;
      const contentRange = upstream.headers.get('content-range');
      if (contentRange) responseHeaders['Content-Range'] = contentRange;
      const contentLength = upstream.headers.get('content-length');
      if (contentLength) responseHeaders['Content-Length'] = contentLength;

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers: responseHeaders,
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'Stream failed' },
        { status: 502 }
      );
    }
  }
);
