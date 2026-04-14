import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';
import { validateParams, getOpenAIRequestBody, getGeminiRequestBody, getEndpoint, getAuthHeaders } from '@/lib/ai-providers';

async function generateWithOpenAI(params: ReturnType<typeof validateParams>): Promise<string> {
  const response = await fetch(getEndpoint('openai'), {
    method: 'POST',
    headers: getAuthHeaders(params),
    body: JSON.stringify(getOpenAIRequestBody(params)),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `OpenAI API error: ${response.status}`);
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
  const response = await fetch(getEndpoint('gemini'), {
    method: 'POST',
    headers: getAuthHeaders(params),
    body: JSON.stringify(getGeminiRequestBody(params)),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData?.error?.message || `Gemini API error: ${response.status}`);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error('No content in Gemini response');
  }

  for (const part of candidate.content.parts) {
    if (part.inlineData?.data) {
      const mimeType = part.inlineData.mimeType || 'image/png';
      return `data:${mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('No image data in Gemini response');
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
    });

    const base64Data = params.provider === 'gemini'
      ? await generateWithGemini(params)
      : await generateWithOpenAI(params);

    // Upload to Supabase Storage
    let imageUrl: string;
    try {
      imageUrl = await uploadImage(base64Data, params.folder, params.filename);
    } catch (uploadErr) {
      console.error('Supabase upload failed, returning base64 fallback:', uploadErr);
      imageUrl = base64Data;
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error('Image generation error:', error);
    const msg = error instanceof Error ? error.message : 'Failed to generate image';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
