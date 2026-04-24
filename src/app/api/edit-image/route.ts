import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';
import { PROVIDER_CONFIG } from '@/lib/ai-providers';

/**
 * Edit an existing generated image with small targeted changes,
 * preserving composition by default. Uses OpenAI gpt-image-1's
 * /v1/images/edits endpoint under the hood.
 *
 * Body:
 *   imageUrl       — source image (http URL or data URI)
 *   editPrompt     — description of the edit
 *   apiKey         — OpenAI key
 *   strength       — 'subtle' | 'medium' | 'major'  (strengthens the edit phrasing)
 *   preserveComposition, preserveSubject — toggles that shape prompt
 *   size, quality  — optional, default to medium/1024x1024
 */
export async function POST(request: NextRequest) {
  try {
    const {
      imageUrl,
      editPrompt,
      apiKey,
      strength = 'medium',
      preserveComposition = true,
      preserveSubject = true,
      size = '1024x1024',
      quality = 'medium',
      folder = 'edited',
      filename = 'image',
    } = await request.json();

    if (!imageUrl) return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
    if (!editPrompt) return NextResponse.json({ error: 'editPrompt required' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });

    // Validate size and quality against the provider whitelist so we never
    // send an invalid parameter. Fall back to safe defaults.
    const validSize = (PROVIDER_CONFIG.openai.validSizes as readonly string[]).includes(size)
      ? size
      : PROVIDER_CONFIG.openai.defaultSize;
    const validQuality = (PROVIDER_CONFIG.openai.validQualities as readonly string[]).includes(quality)
      ? quality
      : PROVIDER_CONFIG.openai.defaultQuality;

    // Fetch the source image bytes
    let sourceBuffer: Buffer;
    if (imageUrl.startsWith('data:')) {
      const base64 = imageUrl.replace(/^data:image\/\w+;base64,/, '');
      sourceBuffer = Buffer.from(base64, 'base64');
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return NextResponse.json({ error: `Could not fetch source image: ${res.status}` }, { status: 500 });
      }
      sourceBuffer = Buffer.from(await res.arrayBuffer());
    }

    // Build the edit prompt with engraving constraints + preservation language
    const strengthPhrase =
      strength === 'subtle'
        ? 'Apply this as a gentle, small adjustment — change very little.'
        : strength === 'major'
          ? 'Apply this as a strong, noticeable edit.'
          : 'Apply this as a moderate edit.';

    const preserveBits: string[] = [];
    if (preserveComposition) preserveBits.push('Keep the overall composition, layout, and framing exactly the same.');
    if (preserveSubject) preserveBits.push('Keep the main subject the same — do not replace it with a different thing.');

    const engraving = 'ENGRAVING MODE: Pure white background. Solid black subject. No color, no gradients, no gray wash, no photographic shading. High contrast, clean line hierarchy.';

    const fullPrompt = [
      engraving,
      `EDIT: ${editPrompt}`,
      strengthPhrase,
      ...preserveBits,
    ].join(' ');

    // Build multipart/form-data using File objects (Node 20+ supports these natively)
    const formData = new FormData();
    formData.append('model', PROVIDER_CONFIG.openai.model);
    formData.append('prompt', fullPrompt);
    formData.append('n', '1');
    formData.append('size', validSize);
    formData.append('quality', validQuality);

    // Wrap the source buffer as a File so the multipart boundary is set correctly
    const blob = new Blob([new Uint8Array(sourceBuffer)], { type: 'image/png' });
    formData.append('image', blob, 'source.png');

    const response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return NextResponse.json(
        { error: err?.error?.message || `OpenAI edit error: ${response.status}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    const imageData = data.data?.[0];
    if (!imageData?.b64_json && !imageData?.url) {
      return NextResponse.json({ error: 'No image data in OpenAI response' }, { status: 500 });
    }

    let base64Data: string;
    if (imageData.b64_json) {
      base64Data = `data:image/png;base64,${imageData.b64_json}`;
    } else {
      const imgRes = await fetch(imageData.url);
      const imgBuffer = await imgRes.arrayBuffer();
      base64Data = `data:image/png;base64,${Buffer.from(imgBuffer).toString('base64')}`;
    }

    // Upload the edited result to Supabase Storage
    let url: string;
    try {
      url = await uploadImage(base64Data, folder, filename);
    } catch (err) {
      console.error('Edit upload failed, falling back to base64:', err);
      url = base64Data;
    }

    return NextResponse.json({ url, prompt: fullPrompt });
  } catch (err) {
    console.error('Edit image error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to edit image' },
      { status: 500 }
    );
  }
}
