import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { withLog } from '@/lib/log';

export const GET = withLog('cfp.stats', async (req: NextRequest) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const qs = req.nextUrl.search;
  const upstream = await cfpFetch(`/stats${qs}`);
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
