import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dbMachineToFrontend } from '@/lib/production-db';

// POST /api/production/machines — add a laser. The board renders whatever
// machines exist, so scaling beyond two requires no redesign.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { data: existing } = await supabaseAdmin.from('machines').select('position');
    const nextPos = (existing ?? []).reduce((mx, r) => Math.max(mx, (r.position as number) ?? 0), -1) + 1;
    const { data, error } = await supabaseAdmin
      .from('machines')
      .insert({
        name: (body.name as string)?.trim() || `Laser Machine ${nextPos + 1}`,
        daily_piece_target: body.dailyPieceTarget ?? 4,
        daily_hours: body.dailyHours ?? 8,
        position: nextPos,
        active: true,
      })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'insert failed' }, { status: 500 });
    return NextResponse.json(dbMachineToFrontend(data), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET /api/production/machines — list machines (seeds the two lasers if the
// table is empty, so a fresh DB still works without manual seeding).
export async function GET() {
  try {
    let { data, error } = await supabaseAdmin
      .from('machines')
      .select('*')
      .order('position', { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (!data || data.length === 0) {
      // Seed defaults on first run.
      await supabaseAdmin.from('machines').insert([
        { name: 'Laser Machine 1', daily_piece_target: 4, daily_hours: 8, position: 0 },
        { name: 'Laser Machine 2', daily_piece_target: 4, daily_hours: 8, position: 1 },
      ]);
      ({ data } = await supabaseAdmin.from('machines').select('*').order('position', { ascending: true }));
    }

    return NextResponse.json((data ?? []).map(dbMachineToFrontend));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
