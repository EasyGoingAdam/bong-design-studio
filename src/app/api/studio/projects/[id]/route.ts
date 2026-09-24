import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { toProject, toTarget, toVersion } from '@/lib/studio-db';

export const maxDuration = 30;

/**
 * GET   /api/studio/projects/[id] — full project: targets + every version.
 * PATCH /api/studio/projects/[id] — update name / status.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: p, error } = await supabaseAdmin.from('design_projects').select('*').eq('id', id).maybeSingle();
  if (error || !p) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const project = toProject(p);
  const { data: targetRows } = await supabaseAdmin.from('design_targets').select('*').eq('project_id', id).order('sort_order', { ascending: true });
  const targets = (targetRows ?? []).map(toTarget);
  const tIds = targets.map((t) => t.id);
  const { data: verRows } = tIds.length ? await supabaseAdmin.from('design_versions').select('*').in('target_id', tIds).order('version_number', { ascending: true }) : { data: [] };
  const versions = (verRows ?? []).map(toVersion);

  project.targets = targets.map((t) => ({
    ...t,
    versions: versions.filter((v) => v.targetId === t.id),
    currentVersion: t.currentVersionId ? versions.find((v) => v.id === t.currentVersionId) ?? null : null,
  }));
  return NextResponse.json(project);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await request.json();
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (typeof b.name === 'string') update.name = b.name;
    if (typeof b.status === 'string') update.status = b.status;
    if (typeof b.refinedPrompt === 'string') update.refined_prompt = b.refinedPrompt;
    const { data, error } = await supabaseAdmin.from('design_projects').update(update).eq('id', id).select().single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
    return NextResponse.json(toProject(data));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Update failed' }, { status: 500 });
  }
}
