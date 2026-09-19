import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { callOpenAIChat, parseJsonResponse } from '@/lib/openai';
import { getServerOpenAIKey } from '@/lib/calendar-mockups-server';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 120;

const SYSTEM_PROMPT = `You brainstorm laser-etched black-and-white glass product designs. Products have a COIL (cylindrical sleeve) and a BASE (circular piece). Designs must read as high-contrast B&W line art suitable for laser etching.
Respond ONLY with JSON: {"ideas":[{"name":"...","description":"2 sentences","theme":"...","style":"...","tags":["..."],"audience":"...","designIdeas":["concrete visual direction","another"],"coilNotes":"...","complexity":3}]}
Be creative and diverse; every idea must be distinct.`;

/**
 * POST /api/bot/ideas — the bot asks the app's AI to brainstorm design ideas.
 *   { prompt?: "theme or occasion", count?: 1..12, create?: boolean }
 * Returns { ideas: [...] }. When create=true, each idea is also saved as a
 * concept in the 'ideation' column and { created: [ids] } is returned.
 */
export async function POST(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;

  const apiKey = await getServerOpenAIKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'No OpenAI key configured in settings.' }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const count = Math.min(Math.max(Number(body.count) || 4, 1), 12);
    const create = !!body.create;
    const seed = Math.random().toString(36).slice(2, 8);
    const userMessage = body.prompt
      ? `${count} distinct laser-etch design ideas for: "${body.prompt}". [${seed}]`
      : `${count} wildly diverse laser-etch design ideas across styles, cultures, and themes. Surprise me. [${seed}]`;

    const raw = await callOpenAIChat({
      apiKey,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      jsonMode: true,
      temperature: 1.0,
      maxTokens: 4000,
    });
    const parsed = parseJsonResponse<{ ideas?: unknown[] }>(raw, { ideas: [] });
    const ideas: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : (parsed.ideas as Record<string, unknown>[]) || [];
    if (ideas.length === 0) return NextResponse.json({ error: 'No ideas generated' }, { status: 502 });

    let created: string[] | undefined;
    if (create) {
      created = [];
      for (const idea of ideas) {
        const id = uuidv4();
        const designIdeas = Array.isArray(idea.designIdeas) ? (idea.designIdeas as string[]) : [];
        const description = [idea.description, designIdeas.length ? `Ideas: ${designIdeas.join('; ')}` : '']
          .filter(Boolean)
          .join('\n\n');
        const { error } = await supabaseAdmin.from('concepts').insert({
          id,
          name: String(idea.name || 'Untitled idea'),
          description,
          tags: Array.isArray(idea.tags) ? idea.tags : [],
          status: 'ideation',
          designer: 'Grok bot',
          source: 'grok',
          coil_only: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        if (!error) created.push(id);
      }
    }

    return NextResponse.json({ ideas, created });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Idea generation failed' }, { status: 500 });
  }
}
