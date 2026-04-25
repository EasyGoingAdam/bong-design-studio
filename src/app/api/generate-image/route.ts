import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';
import {
  validateParams,
  getOpenAIRequestBody,
  getOpenAIv2RequestBody,
  getGeminiRequestBody,
  getEndpoint,
  getAuthHeaders,
  PROVIDER_CONFIG,
} from '@/lib/ai-providers';

async function generateWithOpenAI(
  params: ReturnType<typeof validateParams>,
  variant: 'v1' | 'v2' = 'v1'
): Promise<string> {
  // Both variants hit /v1/images/generations — the only differences are
  // the model identifier and the prompt augmentation, both encoded in the
  // request-body builder.
  const body = variant === 'v2' ? getOpenAIv2RequestBody(params) : getOpenAIRequestBody(params);
  const endpoint = variant === 'v2' ? PROVIDER_CONFIG.openai_v2.endpoint : getEndpoint('openai');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: getAuthHeaders(params),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const modelLabel = variant === 'v2' ? 'gpt-image-2' : 'gpt-image-1';
    throw new Error(errorData?.error?.message || `OpenAI ${modelLabel} API error: ${response.status}`);
  }

  const data = await response.json();
  const imageData = data.data?.[0];

  if (!imageData?.b64_json && !imageData?.url) {
    throw new Error('No image data in OpenAI response');
  }

  if (imageData.b64_json) {
    return `data:image/png;base64,${imageData.b64_json}`;
  }

  const imgRes = await fetch(imageData.url);
  const imgBuffer = await imgRes.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(imgBuffer).toString('base64')}`;
}

async function generateWithGemini(params: ReturnType<typeof validateParams>): Promise<string> {
  const body = getGeminiRequestBody(params);
  const response = await fetch(getEndpoint('gemini'), {
    method: 'POST',
    headers: getAuthHeaders(params),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    // Try to surface the full Google error — their messages are specific
    // (e.g. "Unknown field: generationConfig.temperature") and we need them
    // visible to debug future schema changes.
    const raw = await response.text().catch(() => '');
    let message = `Gemini API error: ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message || message;
    } catch {
      if (raw) message = `${message} — ${raw.slice(0, 500)}`;
    }
    console.error('[Gemini] request failed', { status: response.status, body, raw: raw.slice(0, 1000) });
    throw new Error(message);
  }

  const data = await response.json();

  // Gemini can return a candidate with finishReason=SAFETY and no parts at all
  const candidate = data.candidates?.[0];
  if (!candidate) {
    throw new Error('Gemini returned no candidates — likely blocked by safety filter.');
  }
  if (candidate.finishReason && candidate.finishReason !== 'STOP') {
    throw new Error(
      `Gemini refused to generate (${candidate.finishReason}). Try softer wording or a different prompt.`
    );
  }
  const parts = candidate.content?.parts;
  if (!parts || parts.length === 0) {
    throw new Error('No content in Gemini response');
  }

  for (const part of parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('No image data in Gemini response (only text was returned).');
}

export async function POST(request: NextRequest) {
  try {
    const raw = await request.json();

    // Validate ALL parameters through centralized config — prevents invalid param errors
    const params = validateParams({
      prompt: raw.prompt,
      provider: raw.model,
      apiKey: raw.apiKey,
      geminiKey: raw.geminiKey,
      size: raw.size,
      quality: raw.quality,
      folder: raw.folder,
      filename: raw.filename,
      complexityLevel: raw.complexityLevel,
    });

    let base64Data: string;
    if (params.provider === 'gemini') {
      base64Data = await generateWithGemini(params);
    } else if (params.provider === 'openai_v2') {
      base64Data = await generateWithOpenAI(params, 'v2');
    } else {
      base64Data = await generateWithOpenAI(params, 'v1');
    }

    // Upload to Supabase Storage
    let imageUrl: string;
    try {
      imageUrl = await uploadImage(base64Data, params.folder, params.filename);
    } catch (uploadErr) {
      console.error('Supabase upload failed, returning base64 fallback:', uploadErr);
      imageUrl = base64Data;
    }

    // Echo back which model produced the image so the client can persist
    // it in the AI generation record / version metadata.
    const modelUsed =
      params.provider === 'gemini' ? PROVIDER_CONFIG.gemini.model
      : params.provider === 'openai_v2' ? PROVIDER_CONFIG.openai_v2.model
      : PROVIDER_CONFIG.openai.model;

    return NextResponse.json({ imageUrl, model: modelUsed, provider: params.provider });
  } catch (error) {
    console.error('Image generation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate image';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
