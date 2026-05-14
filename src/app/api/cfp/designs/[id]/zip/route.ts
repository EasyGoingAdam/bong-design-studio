import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: GET /api/cfp/designs/{id}/zip?selectedOnly=1&include=png,svg&versions=1,3
 *
 * Streams the bulk-download ZIP (all versions in PNG/JPEG/SVG plus a
 * manifest.json) from the CFP API. Filename comes from the upstream's
 * Content-Disposition; we preserve it so the team's browser save-as
 * defaults to the design id.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const qs = req.nextUrl.search;
  try {
    const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}/download.zip${qs}`);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status }
      );
    }
    const disposition = upstream.headers.get('content-disposition')
      || `attachment; filename="design-${id.slice(0, 8)}.zip"`;
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': disposition,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Stream failed' },
      { status: 502 }
    );
  }
}
