import { supabaseAdmin } from './supabase';
import { ProductionJob } from './types';

/**
 * ShipStation integration (v2 API — api.shipstation.com, API-Key auth).
 *
 * Server-only. The API token lives in app_settings under 'shipstation_token'
 * and is NEVER sent to the client. We pull the unshipped queue (pending +
 * on_hold shipments) and map each to a production-job draft. The classic
 * v1 "orders" API isn't available with this token, so shipments are the
 * source of truth.
 */

const SS_BASE = 'https://api.shipstation.com';
// Unshipped queue worth planning production for.
const OPEN_STATUSES = ['pending', 'on_hold'];

export async function getShipstationToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'shipstation_token')
    .maybeSingle();
  const v = (data?.value as string) || '';
  return v.trim() || null;
}

async function ssGet(token: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${SS_BASE}${path}`, { headers: { 'API-Key': token } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`ShipStation ${res.status}: ${body.slice(0, 160)}`);
  }
  return res.json();
}

/** Map of tag_id -> name, used to resolve numeric tag references. */
async function fetchTagMap(token: string): Promise<Map<number, string>> {
  try {
    const data = await ssGet(token, '/v2/tags');
    const tags = (data.tags as { tag_id: number; name: string }[]) || [];
    return new Map(tags.map((t) => [t.tag_id, t.name]));
  } catch {
    return new Map();
  }
}

const dateOnly = (iso?: string | null): string | undefined =>
  iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : undefined;

interface SSShipment {
  shipment_id: string;
  shipment_number?: string;
  external_order_id?: string;
  ship_by_date?: string | null;
  deliver_by_date?: string | null;
  hold_until_date?: string | null;
  created_at?: string;
  shipment_status?: string;
  service_code?: string;
  amount_paid?: { amount?: number };
  notes_from_buyer?: string | null;
  internal_notes?: string | null;
  ship_to?: { name?: string };
  tags?: unknown;
  tag_ids?: number[] | null;
  items?: { sku?: string; name?: string; quantity?: number; image_url?: string }[];
}

function tagNames(s: SSShipment, tagMap: Map<number, string>): string[] {
  const names: string[] = [];
  const raw = s.tags;
  if (Array.isArray(raw)) {
    for (const t of raw) {
      if (typeof t === 'string') names.push(t);
      else if (t && typeof t === 'object') {
        const o = t as { name?: string; tag_name?: string };
        if (o.name) names.push(o.name);
        else if (o.tag_name) names.push(o.tag_name);
      }
    }
  }
  for (const id of s.tag_ids || []) {
    const n = tagMap.get(id);
    if (n) names.push(n);
  }
  return Array.from(new Set(names));
}

/** Map one ShipStation shipment to a production-job draft. */
export function mapShipmentToDraft(s: SSShipment, tagMap: Map<number, string>): Partial<ProductionJob> {
  const items = s.items || [];
  const first = items[0];
  const qty = items.reduce((n, it) => n + Math.max(1, it.quantity || 1), 0) || 1;
  const names = tagNames(s, tagMap);
  const rush = names.some((n) => /rush|expedite|priority|prime/i.test(n)) ||
    /express|priority|overnight/i.test(s.service_code || '');
  const label = first?.name ? `${first.name}${items.length > 1 ? ` +${items.length - 1}` : ''}` : 'ShipStation order';

  return {
    title: `#${s.shipment_number || s.external_order_id || s.shipment_id} — ${label}`.slice(0, 120),
    sourceType: 'shipstation',
    shipstationOrderId: s.shipment_id,
    orderId: s.shipment_number || '',
    customerName: s.ship_to?.name || '',
    productType: first?.name || '',
    sku: items.map((it) => it.sku).filter(Boolean).join(', '),
    quantity: qty,
    designImageUrl: first?.image_url || '',
    revenueValue: Math.round(((s.amount_paid?.amount ?? 0)) * 100) / 100,
    shipByDate: dateOnly(s.ship_by_date) || dateOnly(s.deliver_by_date) || dateOnly(s.hold_until_date),
    orderDate: dateOnly(s.created_at),
    rush,
    priority: rush ? 'high' : 'medium',
    tags: Array.from(new Set([...names, 'shipstation'])),
    notes: [s.notes_from_buyer, s.internal_notes].filter(Boolean).join(' · '),
    complexity: 'medium',
    status: 'backlog',
    inventoryAvailable: true,
  };
}

/** Pull the open (unshipped) queue and return mapped job drafts. */
export async function fetchOpenShipmentDrafts(token: string, perStatus = 100): Promise<Partial<ProductionJob>[]> {
  const tagMap = await fetchTagMap(token);
  const drafts: Partial<ProductionJob>[] = [];
  const seen = new Set<string>();
  for (const status of OPEN_STATUSES) {
    const data = await ssGet(token, `/v2/shipments?shipment_status=${status}&page_size=${perStatus}&sort_by=created_at&sort_dir=desc`);
    const shipments = (data.shipments as SSShipment[]) || [];
    for (const s of shipments) {
      if (!s.shipment_id || seen.has(s.shipment_id)) continue;
      seen.add(s.shipment_id);
      drafts.push(mapShipmentToDraft(s, tagMap));
    }
  }
  return drafts;
}
