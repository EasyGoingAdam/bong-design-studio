import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { toVersion } from '@/lib/studio-db';

export const maxDuration = 30;

/**
 * POST /api/studio/restore — make an existing version the target's current one
 * again (non-destructive; no image is lost). { versionId }
 */
export async function POST(request: NextRequest) {
  try {
    const { versionId } = await request.json();
    if (!versionId) return NextResponse.json({ error: 'versionId required' }, { status: 400 });
    const { data: v, error } = await supabaseAdmin.from('design_versions').select('*').eq('id', versionId).maybeSingle();
    if (error || !v) return NextResponse.json({ error: 'version not found' }, { status: 404 });
    const now = new Date().toISOString();
    await supabaseAdmin.from('design_targets').update({ current_version_id: versionId, updated_at: now }).eq('id', v.target_id);
    return NextResponse.json({ version: toVersion(v) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Restore failed' }, { status: 500 });
  }
}
