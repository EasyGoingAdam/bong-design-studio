import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const { prompt, apiKey, size = '1024x1024', folder = 'generated', filename = 'image' } = await request.json();

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 400 });
    }

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-image-1',
        prompt: prompt,
        n: 1,
        size: size,
        quality: 'high',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: errorData?.error?.message || `OpenAI API error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const imageData = data.data?.[0];

    if (!imageData?.b64_json && !imageData?.url) {
      return NextResponse.json({ error: 'No image data in response' }, { status: 500 });
    }

    // Get base64 data
    let base64Data: string;
    if (imageData.b64_json) {
      base64Data = `data:image/png;base64,${imageData.b64_json}`;
    } else {
      // Fetch URL and convert to base64
      const imgRes = await fetch(imageData.url);
      const imgBuffer = await imgRes.arrayBuffer();
      base64Data = `data:image/png;base64,${Buffer.from(imgBuffer).toString('base64')}`;
    }

    // Upload to Supabase Storage for permanent storage
    let imageUrl: string;
    try {
      imageUrl = await uploadImage(base64Data, folder, filename);
    } catch (uploadErr) {
      console.error('Supabase upload failed, returning base64 fallback:', uploadErr);
      // Fallback: return base64 if upload fails (still works, just not persistent)
      imageUrl = base64Data;
    }

    return NextResponse.json({ imageUrl });
  } catch (error) {
    console.error('Image generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate image' },
      { status: 500 }
    );
  }
}
