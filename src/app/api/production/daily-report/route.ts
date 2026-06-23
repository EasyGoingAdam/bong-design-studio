import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

function toFrontend(r: Record<string, unknown>) {
  return {
    id: r.id, date: r.date, data: r.data,
    createdBy: r.created_by ?? '', createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

// GET /api/production/daily-report           → list saved snapshots (metadata)
// GET /api/production/daily-report?date=...   → one snapshot (with data)
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date');
    if (date) {
      const { data } = await supabaseAdmin
        .from('production_daily_reports').select('*').eq('date', date).maybeSingle();
      return NextResponse.json(data ? toFrontend(data) : null);
    }
    const { data, error } = await supabaseAdmin
      .from('production_daily_reports')
      .select('id, date, created_by, created_at, updated_at')
      .order('date', { ascending: false })
      .limit(120);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data ?? []).map(toFrontend));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}

// POST /api/production/daily-report  { date, data, createdBy } — upsert a snapshot.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.date || !body.data) return NextResponse.json({ error: 'date and data required' }, { status: 400 });
    const row = {
      date: body.date, data: body.data,
      created_by: body.createdBy ?? '', updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('production_daily_reports')
      .upsert(row, { onConflict: 'date' })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'save failed' }, { status: 500 });
    return NextResponse.json(toFrontend(data));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'error' }, { status: 500 });
  }
}
