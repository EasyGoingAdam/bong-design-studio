import { NextResponse } from 'next/server';
import { withLog } from '@/lib/log';
import { supabaseAdmin } from '@/lib/supabase';
import { getShipstationToken, fetchOpenShipmentDrafts } from '@/lib/shipstation';

export const maxDuration = 60;

/**
 * Load active SKU → requires-custom rules as a lowercase-SKU map. Tolerant: an
 * unmigrated table yields an empty map, so the import falls back to the
 * name/keyword heuristic already baked into each draft's `custom` flag.
 */
async function loadSkuRules(): Promise<Map<string, boolean>> {
  try {
    const { data, error } = await supabaseAdmin
      .from('manufacturing_products')
      .select('sku, requires_custom_manufacturing, active');
    if (error || !data) return new Map();
    const m = new Map<string, boolean>();
    for (const r of data) {
      if (r.active === false) continue;
      const sku = String(r.sku ?? '').trim().toLowerCase();
      if (sku) m.set(sku, r.requires_custom_manufacturing !== false);
    }
    return m;
  } catch {
    return new Map();
  }
}

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
    // SKU rules are authoritative over the name/keyword heuristic when present.
    const rules = await loadSkuRules();
    const ruled = rules.size === 0
      ? drafts
      : drafts.map((d) => {
          const sku = String(d.sku ?? '').trim().toLowerCase();
          if (sku && rules.has(sku)) {
            return { ...d, custom: rules.get(sku) ?? d.custom, customSource: 'rule' as const };
          }
          return { ...d, customSource: 'heuristic' as const };
        });
    return NextResponse.json({ configured: true, count: ruled.length, drafts: ruled });
  } catch (err) {
    return NextResponse.json(
      { configured: true, error: err instanceof Error ? err.message : 'ShipStation import failed' },
      { status: 502 },
    );
  }
});
