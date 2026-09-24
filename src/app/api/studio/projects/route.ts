import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { toProject, toTarget, toVersion, DesignProject } from '@/lib/studio-db';

export const maxDuration = 30;

/**
 * GET  /api/studio/projects?status=&limit=  — archive list: projects + their
 *      targets + each target's current version (for thumbnails).
 * POST /api/studio/projects                 — create a project with its targets
 *      (no generation yet — the client then calls /api/studio/generate per target).
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '200', 10) || 200, 1), 500);
    let q = supabaseAdmin.from('design_projects').select('*').order('updated_at', { ascending: false }).limit(limit);
    if (sp.get('status')) q = q.eq('status', sp.get('status'));
    const { data: projRows, error } = await q;
    if (error) return NextResponse.json({ projects: [] });
    const projects: DesignProject[] = (projRows ?? []).map(toProject);
    const ids = projects.map((p) => p.id);
    if (ids.length === 0) return NextResponse.json({ projects });

    const { data: targetRows } = await supabaseAdmin.from('design_targets').select('*').in('project_id', ids).order('sort_order', { ascending: true });
    const targets = (targetRows ?? []).map(toTarget);
    const curIds = targets.map((t) => t.currentVersionId).filter(Boolean) as string[];
    const { data: verRows } = curIds.length ? await supabaseAdmin.from('design_versions').select('*').in('id', curIds) : { data: [] };
    const verById = new Map((verRows ?? []).map((v) => [v.id, toVersion(v)]));

    for (const p of projects) {
      p.targets = targets
        .filter((t) => t.projectId === p.id)
        .map((t) => ({ ...t, currentVersion: t.currentVersionId ? verById.get(t.currentVersionId) ?? null : null }));
    }
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'List failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    const name = String(b.name ?? '').trim();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    const targetsIn: unknown[] = Array.isArray(b.targets) ? b.targets : [];
    if (targetsIn.length === 0) return NextResponse.json({ error: 'at least one target is required' }, { status: 400 });

    const projectId = uuidv4();
    const now = new Date().toISOString();
    const { error: pErr } = await supabaseAdmin.from('design_projects').insert({
      id: projectId,
      name,
      original_request: b.originalRequest ?? '',
      refined_prompt: b.refinedPrompt ?? '',
      product_name: b.productName ?? '',
      type: targetsIn.length > 1 ? (b.type ?? 'set') : 'single',
      relationship: b.relationship ?? 'coordinated',
      status: 'draft',
      created_by: b.createdBy ?? '',
      created_at: now,
      updated_at: now,
    });
    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

    const targetRows = targetsIn.map((raw, i) => {
      const t = raw as Record<string, unknown>;
      const w = t.physicalWidth as number | undefined;
      const h = t.physicalHeight as number | undefined;
      return {
        id: uuidv4(),
        project_id: projectId,
        name: String(t.name ?? `Target ${i + 1}`),
        target_type: t.targetType ?? 'coil',
        product_template_id: t.productTemplateId ?? null,
        physical_width: w ?? null,
        physical_height: h ?? null,
        units: t.units ?? 'in',
        aspect_ratio: (t.aspectRatio as number | undefined) ?? (w && h ? w / h : null),
        shape: t.shape ?? 'standard',
        wrap: !!t.wrap,
        seamless: !!t.seamless,
        detail_level: t.detailLevel ?? 'balanced',
        etch_coverage: t.etchCoverage ?? 'medium',
        sort_order: (t.sortOrder as number | undefined) ?? i,
        created_at: now,
        updated_at: now,
      };
    });
    const { data: insertedTargets, error: tErr } = await supabaseAdmin.from('design_targets').insert(targetRows).select();
    if (tErr) return NextResponse.json({ error: tErr.message }, { status: 500 });

    const project = toProject({ id: projectId, name, original_request: b.originalRequest, refined_prompt: b.refinedPrompt, product_name: b.productName, type: targetsIn.length > 1 ? 'set' : 'single', relationship: b.relationship, status: 'draft', created_by: b.createdBy, created_at: now, updated_at: now });
    project.targets = (insertedTargets ?? targetRows).map(toTarget);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Create failed' }, { status: 500 });
  }
}
