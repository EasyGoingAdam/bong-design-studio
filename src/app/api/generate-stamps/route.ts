import { NextRequest, NextResponse } from 'next/server';
import { withLog, log, timer } from '@/lib/log';
import { callOpenAIChat } from '@/lib/openai';

/**
 * POST /api/generate-stamps
 *
 * Produces 1-5 thematically-related "stamps" — small, independent
 * black-and-white engraving graphics — for a single theme.
 *
 * Two-stage:
 *   1. Brainstorm subjects: ask gpt-4o-mini for N distinct subjects
 *      related to the theme (e.g. "baseball" → ball, bat, glove,
 *      player, cap). Caller can skip this by passing `subjects`.
 *   2. Generate each subject in parallel via /api/generate-image
 *      proxy. Each gets a consistent engraving-style prompt so the
 *      stamps read as a unified set.
 *
 * Body:
 *   { theme, count, apiKey, geminiKey?, model?, complexityLevel?,
 *     subjects? } — see below for shape
 *
 * Returns:
 *   { stamps: Stamp[] }  // Stamp = { id, subject, imageUrl, prompt, createdAt, model? }
 */

interface Body {
  theme: string;
  count?: number;        // 1-5, default 3
  apiKey?: string;       // OpenAI key (required for both stages)
  geminiKey?: string;    // optional — only when model='gemini'
  model?: 'openai' | 'openai_v2' | 'gemini';
  complexityLevel?: 1 | 2 | 3 | 4 | 5;
  /** If provided, skips the brainstorm step. Must be at least `count`
   *  long; extras are ignored. */
  subjects?: string[];
}

interface StampOut {
  id: string;
  subject: string;
  imageUrl: string;
  prompt: string;
  createdAt: string;
  model?: string;
  error?: string;        // present when this individual stamp failed; URL will be empty
}

const MAX_STAMPS = 5;
const MIN_STAMPS = 1;

function newStampId(): string {
  return Math.random().toString(36).slice(2, 12);
}

/**
 * Ask gpt-4o-mini for N concrete subjects related to the theme.
 * Returns an array of short subject phrases ("baseball bat", not
 * "a beautifully crafted vintage wooden baseball bat with worn leather grip").
 */
async function brainstormSubjects(theme: string, count: number, apiKey: string): Promise<string[]> {
  const system =
    'You produce concrete subjects for a set of related laser-engraving "stamps". ' +
    'Each subject is a short noun phrase (1-4 words), unambiguous, easy to engrave in pure black on white. ' +
    'Avoid abstract concepts, avoid people\'s names, avoid copyrighted characters. ' +
    'Return ONLY a JSON object: { "subjects": ["...", "..."] }';

  const user =
    `Theme: ${theme.trim()}\nCount: ${count}\n` +
    'Return exactly ' + count + ' distinct subjects related to the theme. ' +
    'Order from most iconic to least.';

  const raw = await callOpenAIChat({
    apiKey,
    model: 'gpt-4o-mini',
    jsonMode: true,
    temperature: 0.4,
    maxTokens: 300,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  let parsed: { subjects?: unknown };
  try { parsed = JSON.parse(raw); } catch {
    throw new Error('Brainstorm returned non-JSON');
  }
  const subjects = Array.isArray(parsed?.subjects)
    ? parsed.subjects.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
    : [];
  if (subjects.length === 0) throw new Error('Brainstorm returned no subjects');
  return subjects.slice(0, count);
}

/**
 * Build the engraving-ready prompt for a single stamp. Tuned so the set
 * reads as a unified, laser-ready collection — same visual weight,
 * isolated subject, no scenery.
 */
function buildStampPrompt(theme: string, subject: string, complexityLevel: number): string {
  const complexity =
    complexityLevel <= 2 ? 'simple, minimal'
    : complexityLevel >= 4 ? 'detailed but laser-ready'
    : 'medium';
  return (
    `Black-and-white laser engraving stamp of a ${subject} (theme: ${theme}). ` +
    `${complexity[0].toUpperCase() + complexity.slice(1)} line work. ` +
    `Pure black on pure white — no gray, no shading, no gradients. ` +
    `Strong silhouette, bold confident lines no thinner than ~0.4mm equivalent at print scale. ` +
    `Subject centered, isolated on a clean white background — no scenery, no environmental detail. ` +
    `Engraving-ready: optimized for laser etching on glass.`
  );
}

/** Hit our own internal image route to generate a single stamp. */
async function generateOneStamp(
  req: NextRequest,
  prompt: string,
  apiKey?: string,
  geminiKey?: string,
  model?: string,
  complexityLevel?: number
): Promise<{ url: string; model?: string; error?: string }> {
  try {
    // Build absolute URL so the fetch from a server route resolves correctly.
    const origin = req.nextUrl.origin;
    const res = await fetch(`${origin}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        apiKey,
        geminiKey,
        size: '1024x1024',
        model: model || 'openai',
        quality: 'medium',
        complexityLevel: complexityLevel ?? 3,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.imageUrl) {
      return { url: '', error: data.error || `Generate failed (${res.status})` };
    }
    return { url: data.imageUrl as string, model: data.model as string | undefined };
  } catch (err) {
    return { url: '', error: err instanceof Error ? err.message : 'Generate failed' };
  }
}

export const POST = withLog('stamps.generate', async (req: NextRequest) => {
  const t = timer();
  let body: Body;
  try { body = (await req.json()) as Body; }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const theme = (body.theme || '').trim();
  if (!theme) return NextResponse.json({ error: 'theme required' }, { status: 400 });

  const count = Math.max(MIN_STAMPS, Math.min(MAX_STAMPS, body.count ?? 3));
  if (!body.apiKey) {
    return NextResponse.json({ error: 'apiKey required (OpenAI key)' }, { status: 400 });
  }

  // Stage 1: subjects
  let subjects: string[];
  if (Array.isArray(body.subjects) && body.subjects.length >= count) {
    subjects = body.subjects.slice(0, count);
    log.info('stamps.subjects.provided', { theme, count });
  } else {
    try {
      subjects = await brainstormSubjects(theme, count, body.apiKey);
      log.info('stamps.subjects.brainstormed', {
        theme, count, duration_ms: t(),
        subjects_preview: subjects.slice(0, 3).join(','),
      });
    } catch (err) {
      log.error('stamps.subjects.fail', { theme, err });
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Could not brainstorm subjects' },
        { status: 502 }
      );
    }
  }

  // Stage 2: parallel generation
  const tGen = timer();
  const stamps: StampOut[] = await Promise.all(
    subjects.map(async (subject) => {
      const prompt = buildStampPrompt(theme, subject, body.complexityLevel ?? 3);
      const result = await generateOneStamp(
        req, prompt, body.apiKey, body.geminiKey, body.model, body.complexityLevel
      );
      return {
        id: newStampId(),
        subject,
        imageUrl: result.url,
        prompt,
        createdAt: new Date().toISOString(),
        model: result.model,
        error: result.error,
      };
    })
  );

  const successCount = stamps.filter((s) => s.imageUrl).length;
  log.info('stamps.generate.done', {
    theme, requested: count, successful: successCount,
    duration_total_ms: t(), duration_gen_ms: tGen(),
  });

  return NextResponse.json({ stamps, theme, requestedCount: count, successCount });
});
