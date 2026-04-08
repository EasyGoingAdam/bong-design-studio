import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// GET /api/templates  — fetch all spec templates
// ---------------------------------------------------------------------------
export async function GET() {
  try {
    const { data: templates, error } = await supabaseAdmin
      .from('spec_templates')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const result = (templates ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      category: t.category ?? '',
      description: t.description ?? '',
      specs: t.specs ?? {},
      coilSpecs: t.coil_specs ?? {},
      baseSpecs: t.base_specs ?? {},
    }));

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/templates  — create template
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const { data: template, error } = await supabaseAdmin
      .from('spec_templates')
      .insert({
        name: body.name ?? 'Untitled Template',
        category: body.category ?? '',
        description: body.description ?? '',
        specs: body.specs ?? {},
        coil_specs: body.coilSpecs ?? {},
        base_specs: body.baseSpecs ?? {},
      })
      .select()
      .single();

    if (error || !template) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create template' }, { status: 500 });
    }

    return NextResponse.json({
      id: template.id,
      name: template.name,
      category: template.category ?? '',
      description: template.description ?? '',
      specs: template.specs ?? {},
      coilSpecs: template.coil_specs ?? {},
      baseSpecs: template.base_specs ?? {},
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT /api/templates  — update template (id in body)
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    const update: Record<string, unknown> = {};
    if (body.name !== undefined) update.name = body.name;
    if (body.category !== undefined) update.category = body.category;
    if (body.description !== undefined) update.description = body.description;
    if (body.specs !== undefined) update.specs = body.specs;
    if (body.coilSpecs !== undefined) update.coil_specs = body.coilSpecs;
    if (body.baseSpecs !== undefined) update.base_specs = body.baseSpecs;

    const { data: template, error } = await supabaseAdmin
      .from('spec_templates')
      .update(update)
      .eq('id', body.id)
      .select()
      .single();

    if (error || !template) {
      return NextResponse.json({ error: error?.message ?? 'Failed to update template' }, { status: 500 });
    }

    return NextResponse.json({
      id: template.id,
      name: template.name,
      category: template.category ?? '',
      description: template.description ?? '',
      specs: template.specs ?? {},
      coilSpecs: template.coil_specs ?? {},
      baseSpecs: template.base_specs ?? {},
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/templates  — delete template (id in body)
// ---------------------------------------------------------------------------
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('spec_templates')
      .delete()
      .eq('id', body.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
