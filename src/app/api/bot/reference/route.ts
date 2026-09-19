import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 60;

type Velocity = 'fast' | 'steady' | 'slow' | 'none';

/**
 * Derive a sell-velocity verdict for a design so the bot has a permanent
 * reference for what sold and how quickly:
 *   1. an explicit metrics.velocity (fast|steady|slow|none) always wins;
 *   2. else metrics.sold === false → 'none';
 *   3. else daysToFirstSale: <=7 fast, <=30 steady, >30 slow;
 *   4. else units sold: >0 → 'steady', 0 → 'none'.
 */
function deriveVelocity(units: number, metrics: Record<string, unknown> | null): Velocity {
  const explicit = metrics?.velocity;
  if (explicit === 'fast' || explicit === 'steady' || explicit === 'slow' || explicit === 'none') {
    return explicit;
  }
  if (metrics && metrics.sold === false) return 'none';
  const days = metrics?.daysToFirstSale;
  if (typeof days === 'number' && Number.isFinite(days)) {
    if (days <= 7) return 'fast';
    if (days <= 30) return 'steady';
    return 'slow';
  }
  return units > 0 ? 'steady' : 'none';
}

/**
 * GET /api/bot/reference — a design reference library keyed by how each design
 * sold. Rolls every design's performance history into a single verdict
 * (sold? fast vs slow) and groups the catalog into velocity buckets plus a
 * by-tag velocity breakdown, so the bot can learn which kinds of laser-etched
 * designs move quickly and lean future ideas toward them.
 *
 * Query: topN (per-bucket cap, default 25, <=200), velocity (filter to one bucket).
 */
export async function GET(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const topN = Math.min(Math.max(parseInt(sp.get('topN') || '25', 10) || 25, 1), 200);
    const filter = (sp.get('velocity') || '').toLowerCase();

    const { data: perf, error } = await supabaseAdmin
      .from('design_performance')
      .select('concept_id, units_sold, revenue, metrics, recorded_at')
      .order('recorded_at', { ascending: false })
      .limit(5000);
    if (error) {
      return NextResponse.json(
        { error: 'design_performance not available (run its migration).', designs: [], buckets: { fast: [], steady: [], slow: [], none: [] } },
        { status: 200 },
      );
    }
    const rows = perf ?? [];

    // Aggregate per concept. Rows are newest-first, so the first row seen for a
    // concept holds its latest metrics + recorded time.
    type Agg = {
      conceptId: string;
      units: number;
      revenue: number;
      latestMetrics: Record<string, unknown> | null;
      latestRecorded: string | null;
    };
    const byConcept = new Map<string, Agg>();
    for (const r of rows) {
      const a = byConcept.get(r.concept_id) ?? { conceptId: r.concept_id, units: 0, revenue: 0, latestMetrics: null, latestRecorded: null };
      a.units += Number(r.units_sold ?? 0);
      a.revenue += Number(r.revenue ?? 0);
      if (a.latestRecorded === null) {
        a.latestRecorded = r.recorded_at ?? null;
        a.latestMetrics = r.metrics && typeof r.metrics === 'object' ? (r.metrics as Record<string, unknown>) : null;
      }
      byConcept.set(r.concept_id, a);
    }

    // Attach design names / tags / collection / status.
    const ids = [...byConcept.keys()];
    type Meta = { id: string; name?: string; external_id?: string; tags?: string[]; collection?: string; status?: string; highlighted?: boolean };
    const meta = new Map<string, Meta>();
    if (ids.length > 0) {
      const { data: concepts } = await supabaseAdmin
        .from('concepts')
        .select('id, name, external_id, tags, collection, status, highlighted')
        .in('id', ids);
      for (const c of concepts ?? []) meta.set(c.id, c as Meta);
    }

    const designs = [...byConcept.values()].map((a) => {
      const c = meta.get(a.conceptId);
      const velocity = deriveVelocity(a.units, a.latestMetrics);
      const days = a.latestMetrics?.daysToFirstSale;
      return {
        conceptId: a.conceptId,
        externalId: c?.external_id ?? null,
        name: c?.name ?? '(unknown)',
        status: c?.status ?? null,
        tags: Array.isArray(c?.tags) ? c!.tags : [],
        collection: c?.collection ?? '',
        highlighted: !!c?.highlighted,
        velocity,
        sold: velocity !== 'none' || a.units > 0,
        unitsSold: a.units,
        revenue: Math.round(a.revenue * 100) / 100,
        daysToFirstSale: typeof days === 'number' ? days : null,
        lastRecorded: a.latestRecorded,
      };
    });

    // Sort so the strongest performers surface first within each bucket.
    const rank: Record<Velocity, number> = { fast: 3, steady: 2, slow: 1, none: 0 };
    designs.sort((x, y) => rank[y.velocity] - rank[x.velocity] || y.unitsSold - x.unitsSold || y.revenue - x.revenue);

    const buckets: Record<Velocity, typeof designs> = { fast: [], steady: [], slow: [], none: [] };
    for (const d of designs) buckets[d.velocity].push(d);

    // Which tags tend to move quickly (average velocity score per tag).
    const tagAgg = new Map<string, { tag: string; designs: number; sold: number; units: number; score: number }>();
    for (const d of designs) {
      for (const tag of d.tags) {
        const t = tagAgg.get(tag) ?? { tag, designs: 0, sold: 0, units: 0, score: 0 };
        t.designs += 1;
        if (d.sold) t.sold += 1;
        t.units += d.unitsSold;
        t.score += rank[d.velocity];
        tagAgg.set(tag, t);
      }
    }
    const byTag = [...tagAgg.values()]
      .map((t) => ({
        tag: t.tag,
        designs: t.designs,
        soldRate: t.designs ? Math.round((t.sold / t.designs) * 100) / 100 : 0,
        unitsSold: t.units,
        avgVelocityScore: t.designs ? Math.round((t.score / t.designs) * 100) / 100 : 0,
      }))
      .sort((x, y) => y.avgVelocityScore - x.avgVelocityScore || y.unitsSold - x.unitsSold)
      .slice(0, topN);

    const counts: Record<Velocity, number> = { fast: buckets.fast.length, steady: buckets.steady.length, slow: buckets.slow.length, none: buckets.none.length };

    if (filter === 'fast' || filter === 'steady' || filter === 'slow' || filter === 'none') {
      return NextResponse.json({
        generatedAt: new Date().toISOString(),
        velocity: filter,
        counts,
        designs: buckets[filter as Velocity].slice(0, topN),
      });
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      totals: { designsWithData: designs.length, sold: designs.filter((d) => d.sold).length, ...counts },
      buckets: {
        fast: buckets.fast.slice(0, topN),
        steady: buckets.steady.slice(0, topN),
        slow: buckets.slow.slice(0, topN),
        none: buckets.none.slice(0, topN),
      },
      byTag,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Reference failed' }, { status: 500 });
  }
}
