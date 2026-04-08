import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// POST /api/concepts/[id]/generations  — add AI generation record
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data: generation, error } = await supabaseAdmin
      .from('ai_generations')
      .insert({
        concept_id: id,
        prompt: body.prompt ?? '',
        coil_prompt: body.coilPrompt ?? '',
        base_prompt: body.basePrompt ?? '',
        mode: body.mode ?? 'concept_art',
        coil_image_url: body.coilImageUrl ?? '',
        base_image_url: body.baseImageUrl ?? '',
        combined_image_url: body.combinedImageUrl ?? '',
        variation_of: body.variationOf ?? null,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !generation) {
      return NextResponse.json({ error: error?.message ?? 'Failed to add generation' }, { status: 500 });
    }

    return NextResponse.json({
      id: generation.id,
      conceptId: generation.concept_id,
      prompt: generation.prompt ?? '',
      coilPrompt: generation.coil_prompt ?? '',
      basePrompt: generation.base_prompt ?? '',
      mode: generation.mode ?? 'concept_art',
      coilImageUrl: generation.coil_image_url ?? '',
      baseImageUrl: generation.base_image_url ?? '',
      combinedImageUrl: generation.combined_image_url ?? '',
      createdAt: generation.created_at,
      variationOf: generation.variation_of ?? undefined,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
