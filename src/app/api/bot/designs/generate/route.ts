import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ENGRAVING_RULES } from '@/lib/prompt-builder';
import { getServerOpenAIKey } from '@/lib/calendar-mockups-server';
import { requireBotKey, resolveConceptId, generateCoilImageServer } from '@/lib/bot-api';

export const maxDuration = 300;

const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

/**
 * POST /api/bot/designs/generate — generate a real coil image for a design and
 * save it onto the concept.
 *   { conceptId? | externalId?, prompt?: "override art direction", size? }
 * If no prompt is given, one is built from the design's name / tags / notes.
 */
export async function POST(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;

  const apiKey = await getServerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key configured in settings.' }, { status: 503 });

  try {
    const body = await request.json();
    const conceptId = await resolveConceptId({ conceptId: body.conceptId, externalId: body.externalId });
    if (!conceptId) return NextResponse.json({ error: 'No matching design for conceptId/externalId' }, { status: 404 });

    const { data: concept } = await supabaseAdmin
      .from('concepts')
      .select('name, description, tags')
      .eq('id', conceptId)
      .maybeSingle();

    const size = SIZES.has(body.size) ? body.size : '1024x1024';
    const tags = Array.isArray(concept?.tags) ? concept!.tags.join(', ') : '';
    const prompt = body.prompt
      ? `${ENGRAVING_RULES.forGeneration} ${body.prompt}`
      : `${ENGRAVING_RULES.forGeneration} Flat coil-sleeve laser-etch design for "${concept?.name ?? 'a glass piece'}". ` +
        `${concept?.description ?? ''} ${tags ? `Style: ${tags}.` : ''} Bold, clean, high-contrast black-on-white line art. No text or lettering.`;

    const coilImageUrl = await generateCoilImageServer(prompt, apiKey, `${conceptId.slice(0, 8)}-coil`, size);
    const stored = !coilImageUrl.startsWith('data:');

    await supabaseAdmin
      .from('concepts')
      .update({ coil_image_url: coilImageUrl, coil_only: true, updated_at: new Date().toISOString() })
      .eq('id', conceptId);

    return NextResponse.json({ conceptId, coilImageUrl, stored });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 });
  }
}
