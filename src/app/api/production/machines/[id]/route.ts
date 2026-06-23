import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dbMachineToFrontend } from '@/lib/production-db';
import { Machine } from '@/lib/types';

// PATCH /api/production/machines/[id] — edit a machine's config.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<Machine>;
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.active !== undefined) patch.active = body.active;
    if (body.dailyPieceTarget !== undefined) patch.daily_piece_target = body.dailyPieceTarget;
    if (body.dailyHours !== undefined) patch.daily_hours = body.dailyHours;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.position !== undefined) patch.position = body.position;
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin.from('machines').update(patch).eq('id', id).select().single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 });
    return NextResponse.json(dbMachineToFrontend(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
