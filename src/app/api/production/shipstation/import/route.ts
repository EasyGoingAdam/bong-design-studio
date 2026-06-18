import { NextResponse } from 'next/server';
import { withLog } from '@/lib/log';
import { getShipstationToken, fetchOpenShipmentDrafts } from '@/lib/shipstation';

export const maxDuration = 60;

/**
 * POST /api/production/shipstation/import
 *
 * Pulls the open (pending + on_hold) ShipStation queue and returns mapped
 * production-job drafts. Does NOT create jobs — the client shows a picker so
 * the operator/admin chooses what to bring into the backlog (and we can dedup
 * against jobs already imported). Token is read server-side from app_settings.
 */
export const POST = withLog('production.shipstation_import', async () => {
  const token = await getShipstationToken();
  if (!token) {
    return NextResponse.json(
      { configured: false, error: 'ShipStation token not configured.' },
      { status: 200 },
    );
  }
  try {
    const drafts = await fetchOpenShipmentDrafts(token);
    return NextResponse.json({ configured: true, count: drafts.length, drafts });
  } catch (err) {
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : 'ShipStation import failed' },
      { status: 502 },
    );
  }
});
