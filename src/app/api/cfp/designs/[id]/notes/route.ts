import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * GET  /api/cfp/designs/{id}/notes — list internal notes
 * POST /api/cfp/designs/{id}/notes — append a note { note, actorName, actorEmail }
 */

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}/notes`);
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const payload = await req.json().catch(() => ({}));
  const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
