import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: GET /api/cfp/customers/{email}?limit=N
 *
 * Returns { summary, designs[] } — every design a single customer has
 * created, with first/last seen timestamps and submitted counts.
 *
 * The email is URL-encoded on the client (e.g. adam%40example.com); we
 * forward it as-is. The CFP server matches case-insensitively.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { email } = await params;
  const qs = req.nextUrl.search;
  try {
    const upstream = await cfpFetch(`/customers/${encodeURIComponent(email)}${qs}`);
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
