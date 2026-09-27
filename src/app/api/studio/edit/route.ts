import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { pickGenerationSize } from '@/lib/ai-providers';
import { buildEtchingEditPrompt } from '@/lib/etching-prompt';
import { produceEditedVersion } from '@/lib/studio-server';
import { toVersion } from '@/lib/studio-db';

export const maxDuration = 300;

/**
 * POST /api/studio/edit — "Edit With AI": refine the CURRENT version's artwork
 * with an image-to-image edit (preserves composition), then save a new version.
 *   { targetId, feedback }
 */
export async function POST(request: NextRequest) {
  try {
    const b = await request.json();
    const targetId = String(b.targetId ?? '');
    const feedback = String(b.feedback ?? '').trim();
    if (!targetId || !feedback) return NextResponse.json({ error: 'targetId and feedback are required' }, { status: 400 });

    const { data: tRow, error: tErr } = await supabaseAdmin.from('design_targets').select('*').eq('id', targetId).maybeSingle();
    if (tErr || !tRow) return NextResponse.json({ error: 'target not found' }, { status: 404 });
    if (!tRow.current_version_id) return NextResponse.json({ error: 'nothing to edit yet — generate first' }, { status: 400 });

    const { data: curV } = await supabaseAdmin.from('design_versions').select('*').eq('id', tRow.current_version_id).maybeSingle();
    if (!curV?.image_url) return NextResponse.json({ error: 'current version has no image' }, { status: 400 });

    const { data: pRow } = await supabaseAdmin.from('design_projects').select('*').eq('id', tRow.project_id).maybeSingle();
    const concept = (pRow?.refined_prompt || pRow?.original_request || '').trim();

    const prompt = buildEtchingEditPrompt({ concept, feedback, targetName: tRow.name });
    const size = tRow.physical_width && tRow.physical_height
      ? pickGenerationSize(tRow.physical_width, tRow.physical_height)
      : (tRow.aspect_ratio ? pickGenerationSize(tRow.aspect_ratio, 1) : '1024x1024');
    const filename = `${tRow.project_id.slice(0, 8)}-${String(tRow.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`;

    const produced = await produceEditedVersion({ sourceUrl: curV.image_url, prompt, size, filename, aspectRatio: tRow.aspect_ratio ?? undefined });

    const { count } = await supabaseAdmin.from('design_versions').select('id', { count: 'exact', head: true }).eq('target_id', targetId);
    const versionId = uuidv4();
    const now = new Date().toISOString();
    const { data: vRow, error: vErr } = await supabaseAdmin.from('design_versions').insert({
      id: versionId,
      target_id: targetId,
      version_number: (count ?? 0) + 1,
      parent_version_id: tRow.current_version_id,
      feedback,
      generation_prompt: prompt,
      image_url: produced.imageUrl,
      raw_image_url: produced.rawImageUrl,
      inverted: !!curV.inverted,
      black_coverage: produced.blackCoverage,
      generation_provider: produced.provider,
      created_by: b.createdBy ?? '',
      created_at: now,
    }).select().single();
    if (vErr || !vRow) return NextResponse.json({ error: vErr?.message ?? 'Could not save version' }, { status: 500 });

    await supabaseAdmin.from('design_targets').update({ current_version_id: versionId, updated_at: now }).eq('id', targetId);
    await supabaseAdmin.from('design_projects').update({ updated_at: now }).eq('id', tRow.project_id);

    return NextResponse.json({ version: toVersion(vRow), validation: produced.validation, stored: produced.stored });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Edit failed' }, { status: 500 });
  }
}
