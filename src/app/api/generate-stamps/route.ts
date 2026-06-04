import { NextRequest, NextResponse } from 'next/server';
import { withLog, log, timer } from '@/lib/log';
import { callOpenAIChat } from '@/lib/openai';
import { uploadImage } from '@/lib/supabase';
import {
  validateParams,
  getOpenAIRequestBody,
  getOpenAIv2RequestBody,
  getEndpoint,
  getAuthHeaders,
  PROVIDER_CONFIG,
} from '@/lib/ai-providers';

/**
 * POST /api/generate-stamps
 *
 * Produces 1-5 thematically-related "stamps" — small, independent
 * black-and-white engraving graphics — for a single theme.
 *
 * Previously this route fetched its OWN /api/generate-image proxy via
 * `${origin}/api/generate-image`. That round-trip went OUT of the
 * Railway container and back in, which the edge layer reliably
 * killed instantly — successful=0 every time, after ~7ms. Replaced
 * with DIRECT calls to OpenAI's /v1/images endpoint, reusing the
 * same helpers that power /api/generate-image. No internal hop.
 *
 * Body:
 *   { theme, count, apiKey, geminiKey?, model?, complexityLevel?,
 *     subjects? }
 *
 * Returns:
 *   { stamps: Stamp[] }  // each Stamp may include `error` on failure
 */

// Allow up to 5 minutes — 5 parallel image gens at ~30s each can spike
// well past Vercel/Railway's default 60s function timeout.
export const maxDuration = 300;

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
  error?: string;
}

const MAX_STAMPS = 5;
const MIN_STAMPS = 1;

function newStampId(): string {
  return Math.random().toString(36).slice(2, 12);
}

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

/**
 * Generate a single stamp by calling OpenAI's /v1/images endpoint
 * DIRECTLY. v2 with auto-fallback to v1 on failure, mirroring the
 * behavior of /api/generate-image so we stay consistent.
 */
async function generateStampDirect(
  prompt: string,
  apiKey: string,
  model: 'openai' | 'openai_v2',
  complexityLevel: number,
  folder: string,
  filename: string
): Promise<{ imageUrl: string; modelUsed: string }> {
  // Build the validated param object the helpers expect.
  const baseParams = validateParams({
    prompt,
    provider: model,
    apiKey,
    size: '1024x1024',
    quality: 'medium',
    folder,
    filename,
    complexityLevel,
  });

  const callOpenAI = async (variant: 'v1' | 'v2'): Promise<string> => {
    const body = variant === 'v2' ? getOpenAIv2RequestBody(baseParams) : getOpenAIRequestBody(baseParams);
    const endpoint = variant === 'v2' ? PROVIDER_CONFIG.openai_v2.endpoint : getEndpoint('openai');
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: getAuthHeaders(baseParams),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const label = variant === 'v2' ? 'gpt-image-2' : 'gpt-image-1';
      throw new Error(errBody?.error?.message || `OpenAI ${label} API error: ${res.status}`);
    }
    const data = await res.json();
    const imgData = data.data?.[0];
    if (!imgData?.b64_json && !imgData?.url) throw new Error('No image data in OpenAI response');
    if (imgData.b64_json) return `data:image/png;base64,${imgData.b64_json}`;
    const fetched = await fetch(imgData.url);
    const buf = await fetched.arrayBuffer();
    return `data:image/png;base64,${Buffer.from(buf).toString('base64')}`;
  };

  let base64Data: string;
  let modelUsed = 'gpt-image-1';
  if (model === 'openai_v2') {
    try {
      base64Data = await callOpenAI('v2');
      modelUsed = 'gpt-image-2';
    } catch (v2err) {
      log.warn('stamps.openai_v2.fallback', { err: v2err });
      base64Data = await callOpenAI('v1');
      modelUsed = 'gpt-image-1';
    }
  } else {
    base64Data = await callOpenAI('v1');
    modelUsed = 'gpt-image-1';
  }

  // Upload to Supabase Storage so the URL outlives the data: URI.
  // Inline base64 fallback if upload fails (matches generate-image).
  let imageUrl: string;
  try {
    imageUrl = await uploadImage(base64Data, folder, filename);
  } catch (uploadErr) {
    log.warn('stamps.upload.fallback_to_inline', { err: uploadErr });
    imageUrl = base64Data;
  }

  return { imageUrl, modelUsed };
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

  // Resolve model — Gemini stays through the standard route since this
  // direct path is OpenAI-only. Default ChatGPT Image 2.0 per the
  // team's preference.
  const requestedModel: 'openai' | 'openai_v2' =
    body.model === 'openai' ? 'openai' : 'openai_v2';

  // Stage 2: parallel direct OpenAI calls
  const tGen = timer();
  const stamps: StampOut[] = await Promise.all(
    subjects.map(async (subject) => {
      const prompt = buildStampPrompt(theme, subject, body.complexityLevel ?? 3);
      const id = newStampId();
      const slug = subject.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 30);
      const filename = `stamp-${slug}-${Date.now()}`;
      try {
        const { imageUrl, modelUsed } = await generateStampDirect(
          prompt,
          body.apiKey!,
          requestedModel,
          body.complexityLevel ?? 3,
          'stamps',
          filename
        );
        return {
          id,
          subject,
          imageUrl,
          prompt,
          createdAt: new Date().toISOString(),
          model: modelUsed,
        };
      } catch (err) {
        log.warn('stamps.one.fail', {
          theme, subject, err,
        });
        return {
          id,
          subject,
          imageUrl: '',
          prompt,
          createdAt: new Date().toISOString(),
          error: err instanceof Error ? err.message : 'Generation failed',
        };
      }
    })
  );

  const successCount = stamps.filter((s) => s.imageUrl).length;
  log.info('stamps.generate.done', {
    theme, requested: count, successful: successCount,
    duration_total_ms: t(), duration_gen_ms: tGen(),
  });

  return NextResponse.json({ stamps, theme, requestedCount: count, successCount });
});
