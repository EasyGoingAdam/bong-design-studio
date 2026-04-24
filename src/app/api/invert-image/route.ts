import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { uploadImage } from '@/lib/supabase';

/**
 * Invert an image's colors server-side using sharp.
 * Pixel-perfect, lossless PNG output. Preserves original dimensions exactly.
 * No canvas re-encoding, no colorspace shifts, no quality degradation.
 */
export async function POST(request: NextRequest) {
  try {
    const { imageUrl, folder = 'inverted', filename = 'image' } = await request.json();

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl required' }, { status: 400 });
    }

    // Fetch the source image (handles data URIs and http URLs, any MIME type).
    // The previous regex `^data:image\/\w+;base64,` failed for `image/svg+xml`
    // and similar compound types. Use a permissive `[^;]+` match instead.
    let sourceBuffer: Buffer;
    if (imageUrl.startsWith('data:')) {
      const base64 = imageUrl.replace(/^data:[^;]+;base64,/, '');
      sourceBuffer = Buffer.from(base64, 'base64');
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) {
        return NextResponse.json(
          { error: `Failed to fetch source image: ${res.status}` },
          { status: 500 }
        );
      }
      sourceBuffer = Buffer.from(await res.arrayBuffer());
    }

    if (sourceBuffer.length === 0) {
      return NextResponse.json({ error: 'Source image has zero bytes' }, { status: 400 });
    }

    // Pixel-perfect invert using sharp.
    // negate() flips every channel; we keep alpha intact.
    // PNG is lossless so no quality loss.
    const metadata = await sharp(sourceBuffer).metadata();
    const invertedBuffer = await sharp(sourceBuffer)
      .negate({ alpha: false })
      .png({ compressionLevel: 9, adaptiveFiltering: true }) // highest quality PNG
      .toBuffer();

    // Upload to Supabase Storage — preserves dimensions
    const base64 = `data:image/png;base64,${invertedBuffer.toString('base64')}`;
    const url = await uploadImage(base64, folder, filename);

    return NextResponse.json({
      url,
      width: metadata.width,
      height: metadata.height,
    });
  } catch (err) {
    console.error('Invert error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to invert image' },
      { status: 500 }
    );
  }
}
