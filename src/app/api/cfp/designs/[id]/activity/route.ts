import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { withLog } from '@/lib/log';

export const GET = withLog<{ id: string }>('cfp.activity', async (
  req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const qs = req.nextUrl.search;
  try {
    const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}/activity${qs}`);
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
});
