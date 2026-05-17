import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';
import { withLog, log } from '@/lib/log';

/**
 * Proxy: POST /api/cfp/designs/{id}/import-receipts
 *
 * Tells the CFP admin "this design has been imported into our local
 * Concepts table as <conceptId>". CFP shows it as a "Linked in
 * engraving tool" badge with deep-link.
 *
 * Idempotent on (designId, conceptId) — re-POSTs upsert so safe to retry.
 *
 * Body shape:
 *   { conceptId, conceptUrl, conceptName, importedBy, importedAt? }
 */

export const POST = withLog<{ id: string }>('cfp.receipts.add', async (
  req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const payload = await req.json().catch(() => ({}));

  log.info('cfp.receipts.add.intent', {
    design_id: id.slice(0, 8),
    concept_id: typeof payload.conceptId === 'string' ? payload.conceptId.slice(0, 8) : undefined,
    actor: payload.importedBy,
  });

  try {
    const upstream = await cfpFetch(
      `/designs/${encodeURIComponent(id)}/import-receipts`,
      { method: 'POST', body: JSON.stringify(payload) }
    );
    const body = await upstream.text();
    return new NextResponse(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Upstream POST failed' },
      { status: 502 }
    );
  }
});

export const GET = withLog<{ id: string }>('cfp.receipts.list', async (
  _req: NextRequest,
  { params }
) => {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const upstream = await cfpFetch(`/designs/${encodeURIComponent(id)}/import-receipts`);
  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
});
