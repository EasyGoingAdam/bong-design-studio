import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { callOpenAIChat, parseJsonResponse } from '@/lib/openai';
import { getServerOpenAIKey } from '@/lib/calendar-mockups-server';
import { requireBotKey, resolveConceptId } from '@/lib/bot-api';

export const maxDuration = 60;

const SYSTEM = `You are a senior copywriter for a premium laser-etched glassware brand. Given a product's name, description and tags, produce marketing copy.
Respond ONLY with JSON: {"taglines":["<punchy tagline>","<option 2>","<option 3>"],"story":"2-3 sentence product story for the listing"}.
Taglines are short (<= 8 words), evocative, no hashtags.`;

/**
 * POST /api/bot/designs/marketing — generate taglines + a product story for a
 * design. { conceptId? | externalId?, apply? }. apply=true saves the first
 * tagline + story onto the design.
 */
export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  const apiKey = await getServerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key configured in settings.' }, { status: 503 });

  try {
    const body = await request.json();
    const conceptId = await resolveConceptId({ conceptId: body.conceptId, externalId: body.externalId });
    if (!conceptId) return NextResponse.json({ error: 'no matching design' }, { status: 404 });

    const { data: c } = await supabaseAdmin
      .from('concepts')
      .select('name, description, tags')
      .eq('id', conceptId)
      .maybeSingle();
    const tags = Array.isArray(c?.tags) ? c!.tags.join(', ') : '';

    const raw = await callOpenAIChat({
      apiKey,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Product: "${c?.name ?? 'Laser-etched glass piece'}". ${c?.description ?? ''} Tags: ${tags}.` },
      ],
      jsonMode: true,
      temperature: 0.9,
      maxTokens: 800,
    });
    const parsed = parseJsonResponse<{ taglines?: string[]; story?: string }>(raw, { taglines: [], story: '' });
    const taglines = Array.isArray(parsed.taglines) ? parsed.taglines : [];
    const story = String(parsed.story ?? '');

    let applied = false;
    if (body.apply && (taglines[0] || story)) {
      await supabaseAdmin
        .from('concepts')
        .update({
          marketing_tagline: taglines[0] ?? undefined,
          marketing_story: story || undefined,
          updated_at: new Date().toISOString(),
        })
        .eq('id', conceptId);
      applied = true;
    }

    return NextResponse.json({ conceptId, taglines, story, applied });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Marketing failed' }, { status: 500 });
  }
}
