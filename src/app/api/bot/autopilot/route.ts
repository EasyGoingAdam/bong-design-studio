import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { callOpenAIChat, parseJsonResponse } from '@/lib/openai';
import { getServerOpenAIKey } from '@/lib/calendar-mockups-server';
import { ENGRAVING_RULES } from '@/lib/prompt-builder';
import { HOLIDAY_EVENTS, nextOccurrence, daysUntil } from '@/lib/holiday-events';
import { requireBotKey, generateCoilImageServer, notifyBotWebhook } from '@/lib/bot-api';

export const maxDuration = 300;

const SIZES = new Set(['1024x1024', '1536x1024', '1024x1536']);

const SYSTEM_PROMPT = `You brainstorm laser-etched black-and-white glass product designs. Products have a COIL (cylindrical sleeve) and a BASE (circular piece). Designs must read as high-contrast B&W line art suitable for laser etching.
You are given signals about what is SELLING and upcoming EVENTS. Bias new ideas toward the winning themes/tags while staying diverse, and cover at least one upcoming event when provided.
Respond ONLY with JSON: {"ideas":[{"name":"...","description":"2 sentences","theme":"...","style":"...","tags":["..."],"audience":"...","designIdeas":["concrete visual direction","another"],"coilNotes":"...","complexity":3}]}
Every idea must be distinct.`;

/**
 * POST /api/bot/autopilot — the daily design engine. One call:
 *   1. studies what's selling (top tags by units + fast velocity),
 *   2. looks at upcoming holidays/events,
 *   3. brainstorms N designs biased toward what works,
 *   4. saves them as `ideation` concepts,
 *   5. optionally generates real coil artwork for each.
 *
 * Body: { count?: 1..12 (default 4), generateArt?: boolean, size?, theme?:
 *   "optional override", eventWindowDays?: number (default 45) }
 *
 * Point a daily scheduler at this endpoint (or have the bot call it once a day)
 * and the studio gets a fresh, on-trend batch of designs every day.
 */
export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;

  const apiKey = await getServerOpenAIKey();
  if (!apiKey) return NextResponse.json({ error: 'No OpenAI key configured in settings.' }, { status: 503 });

  try {
    const body = await request.json().catch(() => ({}));
    const count = Math.min(Math.max(Number(body.count) || 4, 1), 12);
    const generateArt = !!body.generateArt;
    const artPart = ['coil', 'base', 'both'].includes(String(body.part)) ? String(body.part) : 'coil';
    const size = SIZES.has(body.size) ? body.size : '1024x1024';
    const eventWindowDays = Math.min(Math.max(Number(body.eventWindowDays) || 45, 1), 365);

    // --- Signal 1: what's selling. Derive top tags from performance history. ---
    const winningTags = await topSellingTags();

    // --- Signal 2: upcoming events to design drops for. ---
    const from = new Date();
    const events = HOLIDAY_EVENTS
      .map((e) => ({ e, d: daysUntil(e, from), occ: nextOccurrence(e, from) }))
      .filter((x) => x.occ && x.d >= 0 && x.d <= eventWindowDays)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4)
      .map((x) => `${x.e.name} (in ${x.d}d)`);

    const signalLines: string[] = [];
    if (body.theme) signalLines.push(`Focus theme: ${body.theme}.`);
    if (winningTags.length) signalLines.push(`Best-selling tags right now: ${winningTags.join(', ')}.`);
    if (events.length) signalLines.push(`Upcoming events: ${events.join('; ')}.`);
    signalLines.push(`Design ${count} fresh, distinct pieces for today. [${Math.random().toString(36).slice(2, 8)}]`);

    const raw = await callOpenAIChat({
      apiKey,
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: signalLines.join('\n') },
      ],
      jsonMode: true,
      temperature: 1.0,
      maxTokens: 4000,
    });
    const parsed = parseJsonResponse<{ ideas?: unknown[] }>(raw, { ideas: [] });
    const ideas: Record<string, unknown>[] = Array.isArray(parsed) ? parsed : (parsed.ideas as Record<string, unknown>[]) || [];
    if (ideas.length === 0) return NextResponse.json({ error: 'No ideas generated' }, { status: 502 });

    // --- Create concepts (skip names that already exist to avoid dupes). ---
    const names = ideas.map((i) => String(i.name || '').trim()).filter(Boolean);
    const existing = new Set<string>();
    if (names.length) {
      const { data: dupes } = await supabaseAdmin.from('concepts').select('name').in('name', names);
      for (const d of dupes ?? []) existing.add(String(d.name).toLowerCase());
    }

    const created: { conceptId: string; name: string; coilImageUrl?: string; baseImageUrl?: string; art?: 'stored' | 'inline' | 'failed' }[] = [];
    for (const idea of ideas) {
      const name = String(idea.name || 'Untitled idea').trim();
      if (existing.has(name.toLowerCase())) continue;
      const id = uuidv4();
      const designIdeas = Array.isArray(idea.designIdeas) ? (idea.designIdeas as string[]) : [];
      const description = [idea.description, designIdeas.length ? `Ideas: ${designIdeas.join('; ')}` : '']
        .filter(Boolean)
        .join('\n\n');
      const tags = Array.isArray(idea.tags) ? (idea.tags as string[]) : [];
      const { error } = await supabaseAdmin.from('concepts').insert({
        id,
        name,
        description,
        tags,
        status: 'ideation',
        designer: 'Grok bot',
        source: 'grok-autopilot',
        coil_only: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (error) continue;
      existing.add(name.toLowerCase());
      const rec: (typeof created)[number] = { conceptId: id, name };

      if (generateArt) {
        try {
          const styleLine = `${idea.description ?? ''} ${tags.length ? `Style: ${tags.join(', ')}.` : ''}`.trim();
          const artUpdate: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (artPart === 'coil' || artPart === 'both') {
            const coilPrompt =
              `${ENGRAVING_RULES.forGeneration} Flat coil-sleeve laser-etch design for "${name}". ${styleLine} ` +
              `Bold, clean, high-contrast black-on-white line art. No text or lettering.`;
            const coilImageUrl = await generateCoilImageServer(coilPrompt, apiKey, `${id.slice(0, 8)}-coil`, size);
            artUpdate.coil_image_url = coilImageUrl;
            rec.coilImageUrl = coilImageUrl;
          }
          if (artPart === 'base' || artPart === 'both') {
            const basePrompt =
              `${ENGRAVING_RULES.forGeneration} Flat circular base-piece laser-etch design for "${name}". ${styleLine} ` +
              `Centered composition that fills the circular area. Bold, clean, high-contrast black-on-white line art. No text or lettering.`;
            const baseImageUrl = await generateCoilImageServer(basePrompt, apiKey, `${id.slice(0, 8)}-base`, size);
            artUpdate.base_image_url = baseImageUrl;
            rec.baseImageUrl = baseImageUrl;
          }
          artUpdate.coil_only = !(artPart === 'base' || artPart === 'both');
          await supabaseAdmin.from('concepts').update(artUpdate).eq('id', id);
          const anyInline = [rec.coilImageUrl, rec.baseImageUrl].some((u) => u?.startsWith('data:'));
          rec.art = anyInline ? 'inline' : 'stored';
        } catch {
          rec.art = 'failed';
        }
      }
      created.push(rec);
    }

    // Let the bot know a fresh batch landed so it can review/approve.
    if (created.length) {
      notifyBotWebhook({ type: 'designs.created', source: 'autopilot', count: created.length, conceptIds: created.map((c) => c.conceptId) });
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      requested: count,
      createdCount: created.length,
      skippedDuplicates: ideas.length - created.length,
      signals: { winningTags, upcomingEvents: events },
      created,
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Autopilot failed' }, { status: 500 });
  }
}

/** Top tags by units sold across recent performance history (best-effort). */
async function topSellingTags(): Promise<string[]> {
  const { data: perf, error } = await supabaseAdmin
    .from('design_performance')
    .select('concept_id, units_sold, metrics')
    .order('recorded_at', { ascending: false })
    .limit(2000);
  if (error || !perf || perf.length === 0) return [];

  const unitsByConcept = new Map<string, number>();
  const fastConcepts = new Set<string>();
  for (const r of perf) {
    unitsByConcept.set(r.concept_id, (unitsByConcept.get(r.concept_id) ?? 0) + Number(r.units_sold ?? 0));
    const v = r.metrics && typeof r.metrics === 'object' ? (r.metrics as Record<string, unknown>).velocity : undefined;
    if (v === 'fast') fastConcepts.add(r.concept_id);
  }
  const ids = [...unitsByConcept.keys()];
  if (ids.length === 0) return [];
  const { data: concepts } = await supabaseAdmin.from('concepts').select('id, tags').in('id', ids);

  const tagScore = new Map<string, number>();
  for (const c of concepts ?? []) {
    if (!Array.isArray(c.tags)) continue;
    const units = unitsByConcept.get(c.id) ?? 0;
    const boost = fastConcepts.has(c.id) ? 5 : 0; // reward fast sellers even at low volume
    for (const tag of c.tags as string[]) {
      tagScore.set(tag, (tagScore.get(tag) ?? 0) + units + boost);
    }
  }
  return [...tagScore.entries()]
    .filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([tag]) => tag);
}
