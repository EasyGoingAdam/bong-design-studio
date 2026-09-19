import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ENGRAVING_RULES } from '@/lib/prompt-builder';
import { getServerOpenAIKey } from '@/lib/calendar-mockups-server';
import { requireBotKey, resolveConceptId, generateCoilImageServer } from '@/lib/bot-api';

export const maxDuration = 300;

const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);
const SHAPES = new Set(['circle', 'oval', 'square', 'rectangle']);

/**
 * POST /api/bot/designs/generate — generate real etch artwork for a design and
 * save it onto the concept. Handles BOTH the coil sleeve and the base piece.
 *   {
 *     conceptId? | externalId?,
 *     part?: "coil" | "base" | "both"   (default "coil"),
 *     prompt?: "override art direction" (applies to whichever part(s) run),
 *     coilPrompt?, basePrompt?          (per-part override, wins over prompt),
 *     baseShape?: "circle"|"oval"|"square"|"rectangle" (default circle),
 *     size?
 *   }
 * If no prompt is given, one is built from the design's name / tags / notes.
 */
export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;

  const apiKey = await getServerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key configured in settings.' }, { status: 503 });

  try {
    const body = await request.json();
    const conceptId = await resolveConceptId({ conceptId: body.conceptId, externalId: body.externalId });
    if (!conceptId) return NextResponse.json({ error: 'No matching design for conceptId/externalId' }, { status: 404 });

    const part = ['coil', 'base', 'both'].includes(String(body.part)) ? String(body.part) : 'coil';
    const size = SIZES.has(body.size) ? body.size : '1024x1024';
    const baseShape = SHAPES.has(body.baseShape) ? body.baseShape : 'circle';

    const { data: concept } = await supabaseAdmin
      .from('concepts')
      .select('name, description, tags')
      .eq('id', conceptId)
      .maybeSingle();

    const name = concept?.name ?? 'a glass piece';
    const tags = Array.isArray(concept?.tags) ? concept!.tags.join(', ') : '';
    const styleLine = `${concept?.description ?? ''} ${tags ? `Style: ${tags}.` : ''}`.trim();

    const coilPrompt =
      (body.coilPrompt as string) ||
      (body.prompt ? `${ENGRAVING_RULES.forGeneration} ${body.prompt}` : '') ||
      `${ENGRAVING_RULES.forGeneration} Flat coil-sleeve laser-etch design for "${name}". ${styleLine} ` +
        `Bold, clean, high-contrast black-on-white line art. No text or lettering.`;

    const shapeWord = baseShape === 'circle' ? 'circular' : baseShape === 'oval' ? 'oval (elliptical)' : baseShape === 'square' ? 'square' : 'rectangular';
    const basePrompt =
      (body.basePrompt as string) ||
      (body.prompt ? `${ENGRAVING_RULES.forGeneration} ${body.prompt}` : '') ||
      `${ENGRAVING_RULES.forGeneration} Flat ${shapeWord} base-piece laser-etch design for "${name}". ${styleLine} ` +
        `Centered composition that fills the ${shapeWord} area. Bold, clean, high-contrast black-on-white line art. No text or lettering.`;

    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const result: Record<string, unknown> = { conceptId, part };

    if (part === 'coil' || part === 'both') {
      const coilImageUrl = await generateCoilImageServer(coilPrompt, apiKey, `${conceptId.slice(0, 8)}-coil`, size);
      update.coil_image_url = coilImageUrl;
      result.coilImageUrl = coilImageUrl;
      result.coilStored = !coilImageUrl.startsWith('data:');
    }
    if (part === 'base' || part === 'both') {
      const baseImageUrl = await generateCoilImageServer(basePrompt, apiKey, `${conceptId.slice(0, 8)}-base`, size);
      update.base_image_url = baseImageUrl;
      result.baseImageUrl = baseImageUrl;
      result.baseStored = !baseImageUrl.startsWith('data:');
    }

    // Whenever a base is produced the piece is no longer coil-only.
    update.coil_only = !(part === 'base' || part === 'both');

    await supabaseAdmin.from('concepts').update(update).eq('id', conceptId);

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 });
  }
}
