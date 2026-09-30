import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 30;

/**
 * POST /api/studio/projects/[id]/duplicate — copy a design into a new, editable
 * project. Each target's CURRENT version becomes v1 of the copy (same image —
 * no regeneration), so the original and its history stay untouched.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { data: p } = await supabaseAdmin.from('design_projects').select('*').eq('id', id).maybeSingle();
    if (!p) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const now = new Date().toISOString();
    const newProjectId = uuidv4();
    const { error: pErr } = await supabaseAdmin.from('design_projects').insert({
      id: newProjectId,
      name: `${p.name} (copy)`.slice(0, 120),
      original_request: p.original_request,
      refined_prompt: p.refined_prompt,
      product_name: p.product_name,
      type: p.type,
      relationship: p.relationship,
      status: 'draft',
      created_by: body.createdBy ?? p.created_by ?? '',
      created_at: now,
      updated_at: now,
    });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const { data: targets } = await supabaseAdmin.from('design_targets').select('*').eq('project_id', id).order('sort_order', { ascending: true });
    for (const t of targets ?? []) {
      const newTargetId = uuidv4();
      const { error: tErr } = await supabaseAdmin.from('design_targets').insert({
        id: newTargetId,
        project_id: newProjectId,
        name: t.name,
        target_type: t.target_type,
        product_template_id: t.product_template_id,
        physical_width: t.physical_width,
        physical_height: t.physical_height,
        units: t.units,
        aspect_ratio: t.aspect_ratio,
        shape: t.shape,
        wrap: t.wrap,
        seamless: t.seamless,
        detail_level: t.detail_level,
        etch_coverage: t.etch_coverage,
        sort_order: t.sort_order,
        created_at: now,
        updated_at: now,
      });
      if (tErr) continue;

      if (t.current_version_id) {
        const { data: cv } = await supabaseAdmin.from('design_versions').select('*').eq('id', t.current_version_id).maybeSingle();
        if (cv) {
          const newVersionId = uuidv4();
          const { error: vErr } = await supabaseAdmin.from('design_versions').insert({
            id: newVersionId,
            target_id: newTargetId,
            version_number: 1,
            parent_version_id: null,
            feedback: `Duplicated from "${p.name}" v${cv.version_number}`,
            generation_prompt: cv.generation_prompt,
            image_url: cv.image_url,
            raw_image_url: cv.raw_image_url,
            inverted: cv.inverted,
            black_coverage: cv.black_coverage,
            generation_provider: cv.generation_provider,
            created_by: body.createdBy ?? '',
            created_at: now,
          });
          if (!vErr) await supabaseAdmin.from('design_targets').update({ current_version_id: newVersionId }).eq('id', newTargetId);
        }
      }
    }
    return NextResponse.json({ id: newProjectId }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Duplicate failed' }, { status: 500 });
  }
}
