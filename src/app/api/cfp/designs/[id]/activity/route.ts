import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: GET /api/cfp/designs/{id}/activity?limit=N
 * Forwards to the CFP edit-log endpoint and returns the full timeline
 * (regenerations, edits, uploads, status changes, notes, submissions).
 * Newest events first; max 500 per request.
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
}
