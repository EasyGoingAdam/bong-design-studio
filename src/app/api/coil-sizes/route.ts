import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Coil size presets (Small / Regular / XL …). Single-file CRUD with the id in
// the body, mirroring /api/templates. Tolerant on GET so the UI degrades to
// its built-in defaults if the table isn't migrated yet.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFrontend(r: any) {
  return {
    id: r.id,
    name: r.name ?? '',
    widthIn: Number(r.width_in ?? 0),
    heightIn: Number(r.height_in ?? 0),
    sortOrder: r.sort_order ?? 0,
  };
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('coil_sizes')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) {
      console.warn('coil_sizes GET failed (table missing?):', error.message);
      return NextResponse.json([]);
    }
    return NextResponse.json((data ?? []).map(toFrontend));
  } catch {
    return NextResponse.json([]);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const row: Record<string, unknown> = {
      name: body.name ?? 'Untitled',
      width_in: Number(body.widthIn ?? 0),
      height_in: Number(body.heightIn ?? 0),
      sort_order: body.sortOrder ?? 0,
    };
    // Use the client-provided id when present so the optimistic row and the DB
    // row share an id (edits/deletes in the same session then line up).
    if (body.id) row.id = body.id;
    const { data, error } = await supabaseAdmin.from('coil_sizes').insert(row).select().single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create size' }, { status: 500 });
    }
    return NextResponse.json(toFrontend(data), { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Size id is required' }, { status: 400 });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) update.name = body.name;
    if (body.widthIn !== undefined) update.width_in = Number(body.widthIn);
    if (body.heightIn !== undefined) update.height_in = Number(body.heightIn);
    if (body.sortOrder !== undefined) update.sort_order = body.sortOrder;
    const { data, error } = await supabaseAdmin
      .from('coil_sizes')
      .update(update)
      .eq('id', body.id)
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to update size' }, { status: 500 });
    }
    return NextResponse.json(toFrontend(data));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Size id is required' }, { status: 400 });
    const { error } = await supabaseAdmin.from('coil_sizes').delete().eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
