import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { ENGRAVING_RULES } from '@/lib/prompt-builder';
import { getServerOpenAIKey } from '@/lib/calendar-mockups-server';
import { requireBotKey, resolveConceptId, generateCoilImageServer } from '@/lib/bot-api';

export const maxDuration = 300;

const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

/**
 * POST /api/bot/designs/variations — generate several alternative takes on a
 * design so the bot/team can pick the best. Does NOT overwrite the saved image
 * unless `applyIndex` is provided.
 *   {
 *     conceptId? | externalId?,
 *     part?: "coil" | "base" (default "coil"),
 *     count?: 1..6 (default 3),
 *     prompt?: "extra art direction",
 *     applyIndex?: number   // save this variation onto the design
 *     size?
 *   }
 * Returns { variations: [{ index, imageUrl, stored }], applied? }.
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

    const part = body.part === 'base' ? 'base' : 'coil';
    const count = Math.min(Math.max(Number(body.count) || 3, 1), 6);
    const size = SIZES.has(body.size) ? body.size : '1024x1024';

    const { data: concept } = await supabaseAdmin
      .from('concepts')
      .select('name, description, tags')
      .eq('id', conceptId)
      .maybeSingle();
    const name = concept?.name ?? 'a glass piece';
    const tags = Array.isArray(concept?.tags) ? concept!.tags.join(', ') : '';
    const styleLine = `${concept?.description ?? ''} ${tags ? `Style: ${tags}.` : ''} ${body.prompt ?? ''}`.trim();

    const shapeLine = part === 'base'
      ? 'Flat circular base-piece laser-etch design. Centered composition that fills the circular area.'
      : 'Flat coil-sleeve laser-etch design.';

    const variations: { index: number; imageUrl: string; stored: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      // Nudge each variation in a different direction.
      const directions = ['bolder and more minimal', 'more ornate and detailed', 'more geometric', 'more organic and flowing', 'higher symmetry', 'more asymmetric and dynamic'];
      const dir = directions[i % directions.length];
      const prompt =
        `${ENGRAVING_RULES.forGeneration} ${shapeLine} Design for "${name}". ${styleLine} ` +
        `Variation ${i + 1}: ${dir}. Bold, clean, high-contrast black-on-white line art. No text or lettering. [${Math.random().toString(36).slice(2, 7)}]`;
      try {
        const imageUrl = await generateCoilImageServer(prompt, apiKey, `${conceptId.slice(0, 8)}-${part}-v${i + 1}`, size);
        variations.push({ index: i, imageUrl, stored: !imageUrl.startsWith('data:') });
      } catch (err) {
        variations.push({ index: i, imageUrl: '', stored: false });
        console.warn('variation failed:', err instanceof Error ? err.message : err);
      }
    }

    let applied: number | undefined;
    const applyIndex = Number(body.applyIndex);
    if (Number.isInteger(applyIndex) && variations[applyIndex]?.imageUrl) {
      const col = part === 'base' ? 'base_image_url' : 'coil_image_url';
      const update: Record<string, unknown> = { [col]: variations[applyIndex].imageUrl, updated_at: new Date().toISOString() };
      if (part === 'base') update.coil_only = false;
      await supabaseAdmin.from('concepts').update(update).eq('id', conceptId);
      applied = applyIndex;
    }

    return NextResponse.json({ conceptId, part, count: variations.length, variations, applied });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Variations failed' }, { status: 500 });
  }
}
