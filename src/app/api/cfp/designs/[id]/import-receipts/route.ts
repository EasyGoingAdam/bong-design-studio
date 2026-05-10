import { NextRequest, NextResponse } from 'next/server';
import { cfpFetch, getCfpConfig } from '@/lib/cfp-client';

/**
 * Proxy: POST /api/cfp/designs/{id}/import-receipts
 *
 * Tells the CFP admin "this design has been imported into our local
 * Concepts table as <conceptId>". CFP shows it as a "Linked in etching
 * tool" badge with deep-link.
 *
 * Idempotent on (designId, conceptId) — re-POSTs upsert so safe to retry.
 *
 * Body shape:
 *   { conceptId, conceptUrl, conceptName, importedBy, importedAt? }
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!getCfpConfig()) {
    return NextResponse.json({ error: 'CFP_API_KEY not configured' }, { status: 503 });
  }
  const { id } = await params;
  const payload = await req.json().catch(() => ({}));

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
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
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
}
