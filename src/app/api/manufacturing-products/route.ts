import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// SKU → manufacturable rules. Single-file CRUD with the id in the body,
// mirroring /api/coil-sizes. Tolerant on GET so the UI degrades gracefully if
// the table isn't migrated yet.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFrontend(r: any) {
  return {
    id: r.id,
    sku: r.sku ?? '',
    productName: r.product_name ?? '',
    requiresCustomManufacturing: r.requires_custom_manufacturing ?? true,
    coilType: r.coil_type ?? null,
    active: r.active ?? true,
  };
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('manufacturing_products')
      .select('*')
      .order('sku', { ascending: true });
    if (error) {
      console.warn('manufacturing_products GET failed (table missing?):', error.message);
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
      sku: (body.sku ?? '').trim(),
      product_name: body.productName ?? '',
      requires_custom_manufacturing: body.requiresCustomManufacturing ?? true,
      coil_type: body.coilType ?? null,
      active: body.active ?? true,
    };
    if (body.id) row.id = body.id;
    const { data, error } = await supabaseAdmin.from('manufacturing_products').insert(row).select().single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create rule' }, { status: 500 });
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
    if (!body.id) return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.sku !== undefined) update.sku = String(body.sku).trim();
    if (body.productName !== undefined) update.product_name = body.productName;
    if (body.requiresCustomManufacturing !== undefined) update.requires_custom_manufacturing = body.requiresCustomManufacturing;
    if (body.coilType !== undefined) update.coil_type = body.coilType;
    if (body.active !== undefined) update.active = body.active;
    const { data, error } = await supabaseAdmin
      .from('manufacturing_products')
      .update(update)
      .eq('id', body.id)
      .select()
      .single();
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Failed to update rule' }, { status: 500 });
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
    if (!body.id) return NextResponse.json({ error: 'Rule id is required' }, { status: 400 });
    const { error } = await supabaseAdmin.from('manufacturing_products').delete().eq('id', body.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
