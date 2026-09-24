import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import sharp from 'sharp';
import { supabaseAdmin, uploadImage } from '@/lib/supabase';
import { toProductionMaster, validateEtchingArtwork } from '@/lib/production-master';
import { toVersion } from '@/lib/studio-db';

export const maxDuration = 60;

async function loadBytes(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch image (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * POST /api/studio/reverse — instantly invert a version's black/white (no AI).
 * black↔white with exact geometry preserved; saved as a new version.
 *   { versionId }
 */
export async function POST(request: NextRequest) {
  try {
    const { versionId } = await request.json();
    if (!versionId) return NextResponse.json({ error: 'versionId is required' }, { status: 400 });

    const { data: v, error } = await supabaseAdmin.from('design_versions').select('*').eq('id', versionId).maybeSingle();
    if (error || !v) return NextResponse.json({ error: 'version not found' }, { status: 404 });
    if (!v.image_url) return NextResponse.json({ error: 'version has no image' }, { status: 400 });

    // Pixel-invert (grayscale keeps it colorless; negate flips black↔white), then
    // re-assert binary so the reversed master is still true 1-bit.
    const src = await loadBytes(v.image_url);
    const inverted = await sharp(src).grayscale().negate({ alpha: false }).png().toBuffer();
    const master = await toProductionMaster(inverted);
    const validation = await validateEtchingArtwork(master.buffer);

    const filename = `${v.target_id.slice(0, 8)}-reversed-${Date.now()}`;
    let imageUrl = master.dataUri;
    try { imageUrl = await uploadImage(master.dataUri, 'studio', `${filename}-master`); } catch {}

    const { count } = await supabaseAdmin.from('design_versions').select('id', { count: 'exact', head: true }).eq('target_id', v.target_id);
    const versionNumber = (count ?? 0) + 1;
    const id = uuidv4();
    const now = new Date().toISOString();
    const { data: vRow, error: vErr } = await supabaseAdmin.from('design_versions').insert({
      id,
      target_id: v.target_id,
      version_number: versionNumber,
      parent_version_id: versionId,
      feedback: 'Reversed black / white',
      generation_prompt: v.generation_prompt ?? '',
      image_url: imageUrl,
      raw_image_url: '',
      inverted: !v.inverted,
      black_coverage: master.blackCoverage,
      generation_provider: 'invert',
      created_by: '',
      created_at: now,
    }).select().single();
    if (vErr || !vRow) return NextResponse.json({ error: vErr?.message ?? 'Reverse failed' }, { status: 500 });

    await supabaseAdmin.from('design_targets').update({ current_version_id: id, updated_at: now }).eq('id', v.target_id);
    return NextResponse.json({ version: toVersion(vRow), validation });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Reverse failed' }, { status: 500 });
  }
}
