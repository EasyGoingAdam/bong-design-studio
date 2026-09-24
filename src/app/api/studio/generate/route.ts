import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { pickGenerationSize } from '@/lib/ai-providers';
import { buildEtchingPrompt, buildDesignFamilyContext, DetailLevel, EtchCoverage, ArtShape } from '@/lib/etching-prompt';
import { produceEtchVersion } from '@/lib/studio-server';
import { toTarget, toVersion, toProject } from '@/lib/studio-db';

export const maxDuration = 300;

/** Choose the generation size for a target from its physical dims / shape. */
function sizeForTarget(t: { physicalWidth: number | null; physicalHeight: number | null; aspectRatio: number | null; shape: string; wrap: boolean }): string {
  if (t.wrap || t.shape === 'wrap' || t.shape === 'extra_wide') return '1536x1024';
  if (t.shape === 'tall') return '1024x1536';
  if (t.shape === 'wide') return '1536x1024';
  if (t.physicalWidth && t.physicalHeight) return pickGenerationSize(t.physicalWidth, t.physicalHeight);
  if (t.aspectRatio) return pickGenerationSize(t.aspectRatio, 1);
  return '1024x1024';
}

/**
 * POST /api/studio/generate — generate (or regenerate) the artwork for one
 * target. Builds the full production prompt from the target + project, produces
 * a binary black/white master, validates it, stores it, and records a new
 * design_version (which becomes the target's current version).
 *   { targetId, feedback?, parentVersionId? }
 */
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    const targetId = String(b.targetId ?? '');
    if (!targetId) return NextResponse.json({ error: 'targetId is required' }, { status: 400 });

    const { data: tRow, error: tErr } = await supabaseAdmin.from('design_targets').select('*').eq('id', targetId).maybeSingle();
    if (tErr || !tRow) return NextResponse.json({ error: 'target not found' }, { status: 404 });
    const target = toTarget(tRow);

    const { data: pRow } = await supabaseAdmin.from('design_projects').select('*').eq('id', target.projectId).maybeSingle();
    const project = pRow ? toProject(pRow) : null;
    const concept = (project?.refinedPrompt || project?.originalRequest || '').trim();
    if (!concept) return NextResponse.json({ error: 'project has no design description' }, { status: 400 });

    // Coordinated-set direction so siblings share a visual language.
    const family = project?.type === 'set' && project?.relationship !== 'same'
      ? buildDesignFamilyContext(concept, target.detailLevel as DetailLevel)
      : undefined;

    const feedback = typeof b.feedback === 'string' ? b.feedback.trim() : '';
    const conceptWithFeedback = feedback ? `${concept}. Adjustment: ${feedback}` : concept;

    const prompt = buildEtchingPrompt({
      concept: conceptWithFeedback,
      targetName: target.name,
      dimensions: { width: target.physicalWidth ?? undefined, height: target.physicalHeight ?? undefined, units: target.units },
      aspectRatio: target.aspectRatio ?? undefined,
      detailLevel: target.detailLevel as DetailLevel,
      etchCoverage: target.etchCoverage as EtchCoverage,
      shape: target.shape as ArtShape,
      wrap: target.wrap,
      seamless: target.seamless,
      designFamilyContext: family,
    });

    const size = sizeForTarget(target);
    const filename = `${target.projectId.slice(0, 8)}-${target.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

    const produced = await produceEtchVersion({ prompt, size, filename, aspectRatio: target.aspectRatio ?? undefined });

    // Next version number for this target.
    const { count } = await supabaseAdmin.from('design_versions').select('id', { count: 'exact', head: true }).eq('target_id', targetId);
    const versionNumber = (count ?? 0) + 1;

    const versionId = uuidv4();
    const now = new Date().toISOString();
    const { data: vRow, error: vErr } = await supabaseAdmin.from('design_versions').insert({
      id: versionId,
      target_id: targetId,
      version_number: versionNumber,
      parent_version_id: b.parentVersionId ?? target.currentVersionId ?? null,
      feedback,
      generation_prompt: prompt,
      image_url: produced.imageUrl,
      raw_image_url: produced.rawImageUrl,
      inverted: false,
      black_coverage: produced.blackCoverage,
      generation_provider: produced.provider,
      created_by: b.createdBy ?? '',
      created_at: now,
    }).select().single();
    if (vErr || !vRow) return NextResponse.json({ error: vErr?.message ?? 'Could not save version' }, { status: 500 });

    await supabaseAdmin.from('design_targets').update({ current_version_id: versionId, updated_at: now }).eq('id', targetId);
    await supabaseAdmin.from('design_projects').update({ updated_at: now }).eq('id', target.projectId);

    return NextResponse.json({ version: toVersion(vRow), validation: produced.validation, stored: produced.stored });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generate failed' }, { status: 500 });
  }
}
