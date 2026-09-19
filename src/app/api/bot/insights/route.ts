import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 60;

/**
 * GET /api/bot/insights — "what's working": aggregated top sellers, top-rated,
 * best sell-through, and which tags/collections perform, derived from
 * design_performance + concepts. Query: topN (default 10, <=50).
 *
 * This is the bot's fast path to being the expert on what laser-etched designs
 * actually sell — one pull instead of crunching every performance row itself.
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const topN = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('topN') || '10', 10) || 10, 1), 50);

    const { data: perf, error } = await supabaseAdmin
      .from('design_performance')
      .select('concept_id, units_sold, revenue, sell_through_rate, rating, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(5000);
    if (error) {
      return NextResponse.json({ error: 'design_performance not available (run its migration).', topSellers: [] }, { status: 200 });
    }
    const rows = perf ?? [];
    if (rows.length === 0) {
      return NextResponse.json({ generatedAt: new Date().toISOString(), totals: { designsWithData: 0 }, topSellers: [], topRated: [], topSellThrough: [], byTag: [], byCollection: [] });
    }

    // Aggregate per concept (rows are newest-first, so the first seen = latest).
    type Agg = { conceptId: string; units: number; revenue: number; latestRating: number | null; bestSellThrough: number | null };
    const byConcept = new Map<string, Agg>();
    for (const r of rows) {
      const a = byConcept.get(r.concept_id) ?? { conceptId: r.concept_id, units: 0, revenue: 0, latestRating: null, bestSellThrough: null };
      a.units += Number(r.units_sold ?? 0);
      a.revenue += Number(r.revenue ?? 0);
      if (a.latestRating === null && r.rating != null) a.latestRating = Number(r.rating);
      if (r.sell_through_rate != null) a.bestSellThrough = Math.max(a.bestSellThrough ?? 0, Number(r.sell_through_rate));
      byConcept.set(r.concept_id, a);
    }

    // Attach design names / tags / collections.
    const ids = [...byConcept.keys()];
    const { data: concepts } = await supabaseAdmin
      .from('concepts')
      .select('id, name, external_id, tags, collection, status, highlighted')
      .in('id', ids);
    type Meta = { id: string; name?: string; external_id?: string; tags?: string[]; collection?: string; status?: string; highlighted?: boolean };
    const meta = new Map<string, Meta>((concepts ?? []).map((c) => [c.id, c as Meta]));

    const enrich = (a: Agg) => {
      const c = meta.get(a.conceptId);
      return {
        conceptId: a.conceptId,
        externalId: c?.external_id ?? null,
        name: c?.name ?? '(unknown)',
        status: c?.status ?? null,
        highlighted: !!c?.highlighted,
        unitsSold: a.units,
        revenue: Math.round(a.revenue * 100) / 100,
        rating: a.latestRating,
        sellThroughRate: a.bestSellThrough,
      };
    };
    const all = [...byConcept.values()].map(enrich);

    const topSellers = [...all].sort((x, y) => y.revenue - x.revenue || y.unitsSold - x.unitsSold).slice(0, topN);
    const topRated = [...all].filter((x) => x.rating != null).sort((x, y) => (y.rating ?? 0) - (x.rating ?? 0)).slice(0, topN);
    const topSellThrough = [...all].filter((x) => x.sellThroughRate != null).sort((x, y) => (y.sellThroughRate ?? 0) - (x.sellThroughRate ?? 0)).slice(0, topN);

    // Which tags / collections perform (distribute each design's totals).
    const tagAgg = new Map<string, { tag: string; units: number; revenue: number; designs: number }>();
    const colAgg = new Map<string, { collection: string; units: number; revenue: number; designs: number }>();
    for (const a of byConcept.values()) {
      const c = meta.get(a.conceptId);
      for (const tag of Array.isArray(c?.tags) ? c!.tags : []) {
        const t = tagAgg.get(tag) ?? { tag, units: 0, revenue: 0, designs: 0 };
        t.units += a.units; t.revenue += a.revenue; t.designs += 1;
        tagAgg.set(tag, t);
      }
      const col = c?.collection;
      if (col) {
        const cc = colAgg.get(col) ?? { collection: col, units: 0, revenue: 0, designs: 0 };
        cc.units += a.units; cc.revenue += a.revenue; cc.designs += 1;
        colAgg.set(col, cc);
      }
    }
    const round = <T extends { revenue: number }>(x: T) => ({ ...x, revenue: Math.round(x.revenue * 100) / 100 });
    const byTag = [...tagAgg.values()].map(round).sort((x, y) => y.revenue - x.revenue || y.units - x.units).slice(0, topN);
    const byCollection = [...colAgg.values()].map(round).sort((x, y) => y.revenue - x.revenue || y.units - x.units).slice(0, topN);

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: {
        designsWithData: all.length,
        unitsSold: all.reduce((s, x) => s + x.unitsSold, 0),
        revenue: Math.round(all.reduce((s, x) => s + x.revenue, 0) * 100) / 100,
      },
      topSellers,
      topRated,
      topSellThrough,
      byTag,
      byCollection,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Insights failed' }, { status: 500 });
  }
}
