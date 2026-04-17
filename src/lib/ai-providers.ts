/**
 * Centralized AI Provider Configuration
 *
 * Single source of truth for all AI model parameters.
 * All API calls MUST go through validateParams() before hitting external APIs.
 * This prevents invalid parameter errors (like quality: 'standard' on gpt-image-1).
 */

export type AIProvider = 'openai' | 'gemini';

export interface ImageGenParams {
  prompt: string;
  provider: AIProvider;
  apiKey: string;
  geminiKey?: string;
  size: string;
  quality: string;
  folder: string;
  filename: string;
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
const PROVIDER_CONFIG = {
  openai: {
    model: 'gpt-image-1',
    endpoint: 'https://api.openai.com/v1/images/generations',
    // EXHAUSTIVE list of valid values — anything else will cause API errors
    validQualities: ['low', 'medium', 'high', 'auto'] as const,
    defaultQuality: 'medium',
    validSizes: ['1024x1024', '1536x1024', '1024x1536'] as const,
    defaultSize: '1024x1024',
    // These are the ONLY keys allowed in the request body:
    allowedBodyKeys: ['model', 'prompt', 'n', 'size', 'quality'] as const,
  },
  gemini: {
    model: 'gemini-2.5-flash-image',
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    validAspectRatios: ['1:1', '3:2', '4:3', '16:9'] as const,
    defaultAspectRatio: '1:1',
    // Size-to-aspect-ratio mapping
    sizeToAspectRatio: {
      '1024x1024': '1:1',
      '1536x1024': '3:2',
      '1024x1536': '2:3',
    } as Record<string, string>,
  },
} as const;

/**
 * Validate and sanitize image generation parameters.
 * Returns safe, provider-specific params that are guaranteed valid.
 */
export function validateParams(raw: Partial<ImageGenParams> & { prompt: string }): ImageGenParams {
  const provider: AIProvider = raw.provider === 'gemini' ? 'gemini' : 'openai';

  // Validate API key
  if (provider === 'openai' && !raw.apiKey) {
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
 * Get Gemini-specific request body
 */
export function getGeminiRequestBody(params: ImageGenParams) {
  const aspectRatio = PROVIDER_CONFIG.gemini.sizeToAspectRatio[params.size] || PROVIDER_CONFIG.gemini.defaultAspectRatio;
  return {
    contents: [{ parts: [{ text: params.prompt }] }],
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
  return provider === 'gemini' ? PROVIDER_CONFIG.gemini.endpoint : PROVIDER_CONFIG.openai.endpoint;
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
