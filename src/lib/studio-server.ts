import {
  validateParams,
  getOpenAIRequestBody,
  getOpenAIv2RequestBody,
  getGeminiRequestBody,
  getEndpoint,
  getAuthHeaders,
} from './ai-providers';
import { uploadImage } from './supabase';
import { getServerOpenAIKey } from './calendar-mockups-server';
import { toProductionMaster, validateEtchingArtwork, EtchingValidation } from './production-master';

/**
 * Server-side generation for Bong Design Studio 2.0.
 *
 * Reuses the existing provider engine (ai-providers) to get a raw AI image, then
 * runs it through the BINARY production-master pass and validation before
 * storing. Employees never see the raw image or any of this machinery — they
 * get the Production Master. Scoped to 2.0; the shared /api/generate-image path
 * is untouched.
 */

type Provider = 'openai' | 'openai_v2' | 'gemini';

async function callProvider(dataPrompt: string, size: string, provider: Provider, apiKey: string, geminiKey?: string): Promise<string> {
  const params = validateParams({ prompt: dataPrompt, provider, apiKey, geminiKey, size, quality: 'high', folder: 'studio', filename: 'studio' });
  const endpoint = getEndpoint(provider);
  const body =
    provider === 'gemini' ? getGeminiRequestBody(params)
    : provider === 'openai_v2' ? getOpenAIv2RequestBody(params)
    : getOpenAIRequestBody(params);
  const res = await fetch(endpoint, { method: 'POST', headers: getAuthHeaders(params), body: JSON.stringify(body) });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `Image API error ${res.status}`);
  }
  const data = await res.json();
  if (provider === 'gemini') {
    const parts = data.candidates?.[0]?.content?.parts;
    for (const p of parts ?? []) if (p.inlineData?.data) return `data:${p.inlineData.mimeType || 'image/png'};base64,${p.inlineData.data}`;
    throw new Error('No image data in Gemini response');
  }
  const img = data.data?.[0];
  if (img?.b64_json) return `data:image/png;base64,${img.b64_json}`;
  if (img?.url) {
    const r = await fetch(img.url);
    return `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  }
  throw new Error('No image data in response');
}

/** Get a raw AI image. Defaults to gpt-image-2 with graceful fallback to v1. */
export async function generateRawEtchImage(opts: { prompt: string; size: string; apiKey: string; geminiKey?: string; provider?: Provider }): Promise<{ dataUri: string; provider: string }> {
  const provider = opts.provider ?? 'openai_v2';
  if (provider === 'openai_v2') {
    try {
      return { dataUri: await callProvider(opts.prompt, opts.size, 'openai_v2', opts.apiKey, opts.geminiKey), provider: 'openai_v2' };
    } catch (err) {
      console.warn('[studio] gpt-image-2 failed, falling back to v1:', err instanceof Error ? err.message : err);
      return { dataUri: await callProvider(opts.prompt, opts.size, 'openai', opts.apiKey, opts.geminiKey), provider: 'openai' };
    }
  }
  return { dataUri: await callProvider(opts.prompt, opts.size, provider, opts.apiKey, opts.geminiKey), provider };
}

export interface ProducedVersion {
  imageUrl: string;         // stored production-master URL (binary B/W)
  rawImageUrl: string;      // stored raw AI image (provenance; may be data URI on upload failure)
  provider: string;
  blackCoverage: number;
  validation: EtchingValidation;
  stored: boolean;
}

/**
 * Full 2.0 produce pipeline for one target:
 *   generate raw → binary production master → validate → upload.
 * Returns everything the route needs to write a design_version row.
 */
export async function produceEtchVersion(opts: {
  prompt: string;
  size: string;
  filename: string;
  aspectRatio?: number;
  provider?: Provider;
}): Promise<ProducedVersion> {
  const apiKey = await getServerOpenAIKey();
  if (!apiKey) throw new Error('No OpenAI key configured in Settings.');

  const raw = await generateRawEtchImage({ prompt: opts.prompt, size: opts.size, apiKey, provider: opts.provider });
  const master = await toProductionMaster(raw.dataUri); // binary B/W by default
  const validation = await validateEtchingArtwork(master.buffer, { aspectRatio: opts.aspectRatio });

  let imageUrl = master.dataUri;
  let stored = true;
  try {
    imageUrl = await uploadImage(master.dataUri, 'studio', `${opts.filename}-master`);
  } catch {
    stored = false;
  }
  // Raw is best-effort provenance; never fail the produce over it.
  let rawImageUrl = '';
  try {
    rawImageUrl = await uploadImage(raw.dataUri, 'studio', `${opts.filename}-raw`);
  } catch {
    rawImageUrl = '';
  }

  return { imageUrl, rawImageUrl, provider: raw.provider, blackCoverage: master.blackCoverage, validation, stored };
}
