import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey, resolveConceptId } from '@/lib/bot-api';

export const maxDuration = 60;

/**
 * POST /api/bot/performance — bulk-record sales / sell-through / rating data.
 *   { "records": [ { conceptId? | externalId?, unitsSold?, revenue?,
 *                    sellThroughRate?, rating?, periodStart?, periodEnd?,
 *                    source?, metrics?, notes? }, ... ] }
 *
 * GET /api/bot/performance?conceptId=&limit= — read recent performance rows.
 */

export async function POST(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const records: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.records) ? body.records : [];
    if (records.length === 0) {
      return NextResponse.json({ error: 'Provide a non-empty { records: [...] } array.' }, { status: 400 });
    }
    if (records.length > 500) {
      return NextResponse.json({ error: 'Max 500 records per request.' }, { status: 400 });
    }

    const rows: Record<string, unknown>[] = [];
    const errors: { index: number; error: string }[] = [];
    for (let i = 0; i < records.length; i++) {
      const r = records[i] as Record<string, unknown>;
      const conceptId = await resolveConceptId({ conceptId: r.conceptId as string, externalId: r.externalId as string });
      if (!conceptId) {
        errors.push({ index: i, error: 'no matching design for conceptId/externalId' });
        continue;
      }
      rows.push({
        concept_id: conceptId,
        source: r.source ?? 'grok',
        units_sold: r.unitsSold ?? null,
        revenue: r.revenue ?? null,
        sell_through_rate: r.sellThroughRate ?? null,
        rating: r.rating ?? null,
        period_start: r.periodStart ?? null,
        period_end: r.periodEnd ?? null,
        metrics: r.metrics ?? null,
        notes: r.notes ?? null,
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error, count } = await supabaseAdmin.from('design_performance').insert(rows, { count: 'exact' });
      if (error) return NextResponse.json({ error: error.message, errors }, { status: 500 });
      inserted = count ?? rows.length;
    }
    return NextResponse.json({ inserted, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Ingest failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '200', 10) || 200, 1), 1000);
    let q = supabaseAdmin
      .from('design_performance')
      .select('*')
      .order('recorded_at', { ascending: false })
      .limit(limit);
    if (sp.get('conceptId')) q = q.eq('concept_id', sp.get('conceptId'));
    const { data, error } = await q;
    if (error) {
      // Tolerant: table not migrated yet.
      console.warn('design_performance GET failed:', error.message);
      return NextResponse.json({ records: [] });
    }
    return NextResponse.json({ records: data ?? [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read failed' }, { status: 500 });
  }
}
