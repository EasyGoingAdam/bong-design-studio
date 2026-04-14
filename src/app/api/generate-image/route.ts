import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';

async function generateWithOpenAI(prompt: string, apiKey: string, size: string, quality: string = 'auto'): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt,
      n: 1,
      size,
      quality,
    }),
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

  // Fetch URL and convert to base64
  const imgRes = await fetch(imageData.url);
  const imgBuffer = await imgRes.arrayBuffer();
  return `data:image/png;base64,${Buffer.from(imgBuffer).toString('base64')}`;
}

async function generateWithGemini(prompt: string, apiKey: string, aspectRatio: string): Promise<string> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`,
    {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
          imageConfig: {
            aspectRatio,
          },
        },
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData?.error?.message || `Gemini API error: ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts) {
    throw new Error('No content in Gemini response');
  }

  // Find the image part
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
    const {
      prompt,
      apiKey,
      size = '1024x1024',
      folder = 'generated',
      filename = 'image',
      model = 'openai',
      geminiKey,
      quality = 'auto',
    } = await request.json();

    if (model === 'gemini' && !geminiKey) {
      return NextResponse.json({ error: 'Gemini API key is required. Set it in Settings.' }, { status: 400 });
    }
    if (model === 'openai' && !apiKey) {
      return NextResponse.json({ error: 'OpenAI API key is required. Set it in Settings.' }, { status: 400 });
    }
    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    let base64Data: string;

    if (model === 'gemini') {
      // Convert size to aspect ratio for Gemini
      const aspectRatio = size === '1536x1024' ? '3:2' : '1:1';
      base64Data = await generateWithGemini(prompt, geminiKey, aspectRatio);
    } else {
      base64Data = await generateWithOpenAI(prompt, apiKey, size, quality);
    }

    // Upload to Supabase Storage
    let imageUrl: string;
    try {
      imageUrl = await uploadImage(base64Data, folder, filename);
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
