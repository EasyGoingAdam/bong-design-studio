/**
 * Centralized AI Provider Configuration
 *
 * Single source of truth for all AI model parameters.
 * All API calls MUST go through validateParams() before hitting external APIs.
 * This prevents invalid parameter errors (like quality: 'standard' on gpt-image-1).
 */

export type AIProvider = 'openai' | 'openai_v2' | 'gemini';

export interface ImageGenParams {
  prompt: string;
  provider: AIProvider;
  apiKey: string;
  geminiKey?: string;
  size: string;
  quality: string;
  folder: string;
  filename: string;
  /** 1–5 complexity, fed through Gemini prompt tuning */
  complexityLevel?: number;
}

/**
 * Gemini-specific prompt tuning.
 *
 * gemini-2.5-flash-image is faster and cheaper than gpt-image-1, but in our
 * testing it consistently:
 *   - Under-contrasts compared to OpenAI (leaves gray washes)
 *   - Adds extraneous micro-detail on high-complexity requests
 *   - Softens edges that need to be sharp for laser etching
 *
 * This function appends targeted counter-pressure to the prompt based on the
 * concept's complexity level so the output stays engraving-production-ready.
 * We do NOT modify the OpenAI prompt — only Gemini gets this treatment.
 */
export function tuneGeminiPrompt(basePrompt: string, complexityLevel: number = 3): string {
  // Counter Gemini's tendency to leave grays
  const sharpness =
    'CRITICAL FOR GEMINI: The output must be PURE BLACK on PURE WHITE — zero gray, zero soft edges, zero anti-aliased blur. Edges must be crisp and binary.';

  // Complexity-specific guidance
  let complexityNote: string;
  if (complexityLevel <= 2) {
    complexityNote =
      'Keep detail MINIMAL. Use bold strokes, wide negative space, and under 8 major visual elements total. Err on the side of too simple.';
  } else if (complexityLevel >= 4) {
    complexityNote =
      'Rich detail is OK, but every line must be cleanly separable — no chaotic cross-hatch that blurs into gray. Thicken all primary strokes.';
  } else {
    complexityNote =
      'Balanced detail — strong silhouette with controlled supporting pattern. No feathered edges or textural noise.';
  }

  return [basePrompt, sharpness, complexityNote].join(' ');
}

/**
 * VALID PARAMETERS PER PROVIDER
 *
 * gpt-image-1 API accepts ONLY these params in the request body:
 *   model, prompt, n, size, quality
 *   - quality: 'low' | 'medium' | 'high' | 'auto'
 *   - size: '1024x1024' | '1536x1024' | '1024x1536'
 *   - Returns base64 by default (b64_json in response)
 *   - Do NOT pass: output_format, response_format, style, or any other param
 *
 * Gemini generateContent accepts:
 *   contents, generationConfig (with responseModalities, imageConfig.aspectRatio)
 */
// Model identifier resolution. Defaults to gpt-image-1, but can be
// overridden at runtime via OPENAI_IMAGE_MODEL env var so you can swap to
// a newer model (e.g. when OpenAI releases a successor) without code
// changes. Set on the server only — never expose to the browser.
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';

// Second-generation OpenAI image model. Defaults to 'gpt-image-2' as
// requested. If OpenAI ships the actual successor under a different ID
// (e.g. 'gpt-image-1.5'), set OPENAI_IMAGE_MODEL_V2 in Railway → Variables
// and the v2 button will route there without a code change.
const OPENAI_IMAGE_MODEL_V2 = process.env.OPENAI_IMAGE_MODEL_V2 || 'gpt-image-2';

const PROVIDER_CONFIG = {
  openai: {
    model: OPENAI_IMAGE_MODEL,
    endpoint: 'https://api.openai.com/v1/images/generations',
    // EXHAUSTIVE list of valid values — anything else will cause API errors
    validQualities: ['low', 'medium', 'high', 'auto'] as const,
    defaultQuality: 'medium',
    validSizes: ['1024x1024', '1536x1024', '1024x1536'] as const,
    defaultSize: '1024x1024',
    // These are the ONLY keys allowed in the request body:
    allowedBodyKeys: ['model', 'prompt', 'n', 'size', 'quality'] as const,
  },
  openai_v2: {
    model: OPENAI_IMAGE_MODEL_V2,
    endpoint: 'https://api.openai.com/v1/images/generations',
    // V2 likely keeps the same param shape as v1 — same whitelist.
    validQualities: ['low', 'medium', 'high', 'auto'] as const,
    defaultQuality: 'high', // higher default since it's the "best" tier
    validSizes: ['1024x1024', '1536x1024', '1024x1536'] as const,
    defaultSize: '1024x1024',
    allowedBodyKeys: ['model', 'prompt', 'n', 'size', 'quality'] as const,
  },
  gemini: {
    model: 'gemini-2.5-flash-image',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    // gemini-2.5-flash-image supports these aspect ratios in imageConfig
    validAspectRatios: ['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16'] as const,
    defaultAspectRatio: '1:1',
    // Size-to-aspect-ratio mapping — every value MUST be in validAspectRatios above
    sizeToAspectRatio: {
      '1024x1024': '1:1',
      '1536x1024': '3:2',
      '1024x1536': '2:3',
    } as Record<string, string>,
  },
} as const;

/**
 * Engraving-optimized prompt augmentation specific to gpt-image-2.
 *
 * The user requested stronger production constraints for the v2 model
 * specifically — even tighter than the standard ENGRAVING_RULES. Layered
 * on top of (not replacing) the base prompt + standard engraving rules.
 *
 * Why a v2-specific function: as new image models tend to produce
 * subtly-different output styles than their predecessors, having a
 * dedicated tuner means we can iterate on v2 wording without affecting
 * v1 prompts.
 */
export function tuneOpenAIv2Prompt(basePrompt: string): string {
  const v2Constraints = [
    '',
    'CRITICAL CONSTRAINTS — laser-etch production, must be obeyed:',
    '- PURE black and white only. ZERO gray, ZERO gradients, ZERO halftones.',
    '- Pure white background. Solid pure black subject.',
    '- THICK, clean vector-style lines. Bold strokes, no fine hatching.',
    '- Centered main subject with clear focal hierarchy.',
    '- Edges must be CRISP and BINARY — no anti-aliased blur, no soft edges.',
    '- Manufacturing-ready cleanliness — every stroke etchable at production size.',
    '- Horizontal layout when the dimensions favor a wider canvas.',
  ].join('\n');
  return `${basePrompt}${v2Constraints}`;
}

/**
 * Validate and sanitize image generation parameters.
 * Returns safe, provider-specific params that are guaranteed valid.
 */
export function validateParams(raw: Partial<ImageGenParams> & { prompt: string }): ImageGenParams {
  const provider: AIProvider =
    raw.provider === 'gemini' ? 'gemini'
    : raw.provider === 'openai_v2' ? 'openai_v2'
    : 'openai';

  // Validate API key — both OpenAI flavors share the same key.
  if ((provider === 'openai' || provider === 'openai_v2') && !raw.apiKey) {
    throw new Error('OpenAI API key is required. Set it in Settings.');
  }
  if (provider === 'gemini' && !raw.geminiKey) {
    throw new Error('Gemini API key is required. Set it in Settings.');
  }

  // Validate prompt
  if (!raw.prompt?.trim()) {
    throw new Error('Prompt is required.');
  }

  // Validate and sanitize size
  const validSizes = PROVIDER_CONFIG.openai.validSizes as readonly string[];
  const size = validSizes.includes(raw.size || '') ? raw.size! : PROVIDER_CONFIG.openai.defaultSize;

  // Validate and sanitize quality (OpenAI-specific)
  const validQualities = PROVIDER_CONFIG.openai.validQualities as readonly string[];
  const quality = validQualities.includes(raw.quality || '') ? raw.quality! : PROVIDER_CONFIG.openai.defaultQuality;

  return {
    prompt: raw.prompt.trim(),
    provider,
    apiKey: raw.apiKey || '',
    geminiKey: raw.geminiKey,
    size,
    quality,
    folder: raw.folder || 'generated',
    filename: raw.filename || 'image',
    complexityLevel: typeof raw.complexityLevel === 'number' ? raw.complexityLevel : undefined,
  };
}

/**
 * Get OpenAI-specific request body.
 * SAFETY: Only includes keys listed in allowedBodyKeys. Any extra keys are silently dropped.
 * This prevents "Invalid value" errors from unexpected parameters.
 */
export function getOpenAIRequestBody(params: ImageGenParams): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: PROVIDER_CONFIG.openai.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    quality: params.quality,
  };

  // SAFETY NET: Strip any keys that aren't in the allowed list.
  // This is the last line of defense against invalid-parameter errors.
  const allowed = new Set<string>(PROVIDER_CONFIG.openai.allowedBodyKeys);
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) {
      filtered[key] = body[key];
    } else {
      console.warn(`[ai-providers] Dropping unexpected OpenAI body key: ${key}`);
    }
  }
  return filtered;
}

/**
 * Get the OpenAI v2 request body. Same shape as v1 but uses the v2 model
 * identifier and applies the v2-specific prompt tuning automatically.
 */
export function getOpenAIv2RequestBody(params: ImageGenParams): Record<string, unknown> {
  const tunedPrompt = tuneOpenAIv2Prompt(params.prompt);
  const body: Record<string, unknown> = {
    model: PROVIDER_CONFIG.openai_v2.model,
    prompt: tunedPrompt,
    n: 1,
    size: params.size,
    quality: params.quality,
  };
  const allowed = new Set<string>(PROVIDER_CONFIG.openai_v2.allowedBodyKeys);
  const filtered: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) filtered[key] = body[key];
  }
  return filtered;
}

/**
 * Get Gemini-specific request body
 */
export function getGeminiRequestBody(params: ImageGenParams) {
  const aspectRatio =
    PROVIDER_CONFIG.gemini.sizeToAspectRatio[params.size] ||
    PROVIDER_CONFIG.gemini.defaultAspectRatio;

  // Apply Gemini-specific tuning to counter soft-edge / gray-wash tendencies,
  // and encode aspect ratio directly in the prompt text as a belt-and-braces
  // fallback in case `imageConfig` is rejected.
  const tunedPrompt = [
    tuneGeminiPrompt(params.prompt, params.complexityLevel),
    `Output aspect ratio: ${aspectRatio}.`,
  ].join(' ');

  // IMPORTANT: For gemini-2.5-flash-image, `generationConfig` must ONLY contain
  // `responseModalities` and `imageConfig`. Adding `temperature`, `topK`, or
  // other text-only knobs causes a 400 "Unknown field" from the API.
  return {
    contents: [{ parts: [{ text: tunedPrompt }] }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio },
    },
  };
}

/**
 * Get the correct endpoint URL for a provider
 */
export function getEndpoint(provider: AIProvider): string {
  if (provider === 'gemini') return PROVIDER_CONFIG.gemini.endpoint;
  if (provider === 'openai_v2') return PROVIDER_CONFIG.openai_v2.endpoint;
  return PROVIDER_CONFIG.openai.endpoint;
}

/**
 * Get auth headers for a provider
 */
export function getAuthHeaders(params: ImageGenParams): Record<string, string> {
  if (params.provider === 'gemini') {
    return {
      'x-goog-api-key': params.geminiKey || '',
      'Content-Type': 'application/json',
    };
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${params.apiKey}`,
  };
}

// Export config for reference
export { PROVIDER_CONFIG };
