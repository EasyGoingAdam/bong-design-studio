import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// POST /api/concepts/[id]/versions  — create new version for concept
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Get current max version number
    const { data: existing } = await supabaseAdmin
      .from('concept_versions')
      .select('version_number')
      .eq('concept_id', id)
      .order('version_number', { ascending: false })
      .limit(1);

    const nextVersion = existing && existing.length > 0 ? (existing[0].version_number as number) + 1 : 1;

    const { data: version, error } = await supabaseAdmin
      .from('concept_versions')
      .insert({
        concept_id: id,
        version_number: nextVersion,
        coil_image_url: body.coilImageUrl ?? '',
        base_image_url: body.baseImageUrl ?? '',
        combined_image_url: body.combinedImageUrl ?? '',
        prompt: body.prompt ?? '',
        notes: body.notes ?? '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !version) {
      return NextResponse.json({ error: error?.message ?? 'Failed to create version' }, { status: 500 });
    }

    return NextResponse.json({
      id: version.id,
      conceptId: version.concept_id,
      versionNumber: version.version_number,
      coilImageUrl: version.coil_image_url ?? '',
      baseImageUrl: version.base_image_url ?? '',
      combinedImageUrl: version.combined_image_url ?? '',
      prompt: version.prompt ?? '',
      notes: version.notes ?? '',
      createdAt: version.created_at,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
