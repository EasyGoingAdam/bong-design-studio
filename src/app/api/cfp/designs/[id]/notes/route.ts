import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { withLog, log } from '@/lib/log';

export const GET = withLog<{ id: string }>('cfp.notes.list', async (
  _req: NextRequest,
  { params }
) => {
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
});

export const POST = withLog<{ id: string }>('cfp.notes.add', async (
  req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const payload = await req.json().catch(() => ({}));
  log.info('cfp.notes.add.intent', {
    design_id: id.slice(0, 8),
    actor: payload.actorName,
    note_len: typeof payload.note === 'string' ? payload.note.length : 0,
  });
  const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
