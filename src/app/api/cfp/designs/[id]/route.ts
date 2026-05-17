import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { withLog, log } from '@/lib/log';

/**
 * GET   /api/cfp/designs/{id} — full design + prompts + all versions
 * PATCH /api/cfp/designs/{id} — forward { status, internalNotes, actorName, actorEmail }
 */

export const GET = withLog<{ id: string }>('cfp.designs.get', async (
  _req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  try {
    const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}`);
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

export const PATCH = withLog<{ id: string }>('cfp.designs.patch', async (
  req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const payload = await req.json().catch(() => ({}));

  // Audit the team-action specifically — this is the state-change op
  // where we most want to see what actually happened.
  log.info('cfp.designs.patch.intent', {
    design_id: id.slice(0, 8),
    new_status: payload.status,
    has_note: !!payload.internalNotes,
    actor: payload.actorName,
  });

  try {
    const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upstream patch failed' },
      { status: 502 }
    );
  }
});
