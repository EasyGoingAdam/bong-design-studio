import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dbMachineToFrontend } from '@/lib/production-db';

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
