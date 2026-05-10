import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: GET /api/cfp/designs?…
 * Forwards every query param to the external CFP /designs endpoint, hiding
 * the API key from the browser. Returns the response body 1:1 so the
 * client can use the upstream pagination cursor as-is.
 */
export async function GET(req: NextRequest) {
  if (!getCfpConfig()) {
    return NextResponse.json(
      { error: 'Customize Freeze Pipe API not configured. Set CFP_API_KEY env var.' },
      { status: 503 }
    );
  }

  const qs = req.nextUrl.search;
  try {
    const upstream = await cfpFetch(`/designs${qs}`);
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upstream fetch failed' },
      { status: 502 }
    );
  }
}
