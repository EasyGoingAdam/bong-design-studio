import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dbScheduleDayToFrontend, logProduction } from '@/lib/production-db';

// GET /api/production/schedule?date=YYYY-MM-DD — fetch (or lazily create) the
// schedule-day row so the board knows the lock state. Omit `date` to list all.
export async function GET(request: NextRequest) {
  try {
    const date = request.nextUrl.searchParams.get('date');
    if (!date) {
      const { data, error } = await supabaseAdmin
        .from('production_schedule_days')
        .select('*')
        .order('date', { ascending: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json((data ?? []).map(dbScheduleDayToFrontend));
    }

    let { data } = await supabaseAdmin
      .from('production_schedule_days')
      .select('*')
      .eq('date', date)
      .maybeSingle();

    if (!data) {
      const ins = await supabaseAdmin
        .from('production_schedule_days')
        .insert({ date })
        .select()
        .single();
      data = ins.data;
    }

    return NextResponse.json(data ? dbScheduleDayToFrontend(data) : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/production/schedule — lock/unlock a day or store AI summary.
// Body: { date, locked?, lockedBy?, notes?, aiSummary? }
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const date = body.date as string;
    if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 });

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.locked !== undefined) {
      patch.locked = body.locked;
      patch.locked_at = body.locked ? new Date().toISOString() : null;
      patch.locked_by = body.locked ? (body.lockedBy ?? '') : '';
    }
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.aiSummary !== undefined) patch.ai_summary = body.aiSummary;
    if (body.closed !== undefined) {
      patch.closed = body.closed;
      patch.closed_at = body.closed ? new Date().toISOString() : null;
      patch.closed_by = body.closed ? (body.closedBy ?? '') : '';
    }
    if (body.closeout !== undefined) patch.closeout = body.closeout;

    // Upsert the day row.
    const existing = await supabaseAdmin
      .from('production_schedule_days')
      .select('id')
      .eq('date', date)
      .maybeSingle();

    let data;
    if (existing.data) {
      const r = await supabaseAdmin
        .from('production_schedule_days')
        .update(patch)
        .eq('date', date)
        .select()
        .single();
      data = r.data;
    } else {
      const r = await supabaseAdmin
        .from('production_schedule_days')
        .insert({ date, ...patch })
        .select()
        .single();
      data = r.data;
    }

    if (body.locked !== undefined) {
      logProduction({
        action: body.locked ? 'schedule.lock' : 'schedule.unlock',
        newValue: { date },
        userName: body.lockedBy,
      });
    }
    if (body.closed !== undefined) {
      logProduction({
        action: body.closed ? 'schedule.closeout' : 'schedule.reopen',
        newValue: body.closed ? { date, closeout: body.closeout } : { date },
        userName: body.closedBy,
      });
    }

    return NextResponse.json(data ? dbScheduleDayToFrontend(data) : null);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
