import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { toTemplate } from '@/lib/studio-db';

export const maxDuration = 30;

/**
 * GET  /api/product-templates            — list active product templates.
 * POST /api/product-templates            — create one (admin editor).
 * Tolerant: returns [] if the table isn't migrated yet.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('product_templates')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('product_name', { ascending: true });
  if (error) return NextResponse.json({ templates: [] });
  return NextResponse.json({ templates: (data ?? []).map(toTemplate) });
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    const row = {
      product_name: String(b.productName ?? '').trim(),
      target_name: String(b.targetName ?? '').trim(),
      target_type: b.targetType ?? 'coil',
      width_in: b.widthIn ?? null,
      height_in: b.heightIn ?? null,
      units: b.units ?? 'in',
      aspect_ratio: b.aspectRatio ?? (b.widthIn && b.heightIn ? b.widthIn / b.heightIn : null),
      shape: b.shape ?? 'standard',
      supports_wrap: !!b.supportsWrap,
      seamless_default: !!b.seamlessDefault,
      preview_image: b.previewImage ?? '',
      machine_profile: b.machineProfile ?? '',
      sort_order: b.sortOrder ?? 0,
      active: b.active !== false,
      updated_at: new Date().toISOString(),
    };
    if (!row.product_name || !row.target_name) {
      return NextResponse.json({ error: 'productName and targetName are required' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('product_templates')
      .upsert(row, { onConflict: 'product_name,target_name' })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 });
    return NextResponse.json(toTemplate(data), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Create failed' }, { status: 500 });
  }
}
