import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { uploadImage } from '@/lib/supabase';

/**
 * Composite a marketing graphic from a product photo + product name + coil design.
 *
 * Layout (1200×1200 square by default, aspect-configurable):
 *   - Full-frame background: product photo (cover-fit, optional subtle dim for legibility)
 *   - Top-left: product name pill (configurable style)
 *   - Top-right: coil design on a white rounded badge
 *   - Optional tagline: small text below the product name
 *
 * Uses sharp for pixel-perfect server-side compositing so the final output
 * is deterministic and independent of the browser canvas.
 */

type NameStyle = 'white_pill' | 'black_pill' | 'transparent_light' | 'transparent_dark';
type Aspect = 'square' | 'portrait' | 'landscape' | 'story';

interface Body {
  productPhoto: string;        // http URL or data URI — required
  productName: string;         // required
  coilImageUrl: string;        // http URL or data URI — required
  tagline?: string;            // optional 1-line subtitle
  nameStyle?: NameStyle;       // defaults to white_pill
  aspect?: Aspect;             // defaults to square
  coilBadgeSize?: number;      // px, defaults to 280
  padding?: number;            // px, defaults to 40
  dimBackground?: boolean;     // subtle dim overlay for legibility, default false
  folder?: string;             // storage folder, defaults to 'marketing'
  filenameHint?: string;       // slugged into the object name
}

const ASPECT_SIZES: Record<Aspect, { width: number; height: number }> = {
  square: { width: 1200, height: 1200 },
  portrait: { width: 1080, height: 1350 },   // Instagram portrait
  landscape: { width: 1600, height: 1000 },
  story: { width: 1080, height: 1920 },      // Instagram/TikTok story
};

// Escape XML special chars so product names with &, <, >, etc. don't break the SVG
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Rough character-based width estimate at the chosen font size. sharp can't
// measure text without shaping, so we size the pill from the character count
// and let the text flow inside with left padding. Good enough for a product
// name of 1-6 words.
function estimateNamePillWidth(text: string, fontSize: number): number {
  // Average glyph width ≈ 0.55 × fontSize for a system sans font at bold weight
  const estimatedTextWidth = Math.min(text.length, 30) * fontSize * 0.55;
  return Math.round(estimatedTextWidth + fontSize * 1.2); // add horizontal padding
}

async function fetchBuffer(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    const m = src.match(/^data:[^;]+;base64,(.+)$/);
    if (!m) throw new Error('Invalid data URI');
    return Buffer.from(m[1], 'base64');
  }
  const r = await fetch(src);
  if (!r.ok) throw new Error(`Could not fetch image (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}

function buildNameSvg(
  name: string,
  tagline: string | undefined,
  style: NameStyle,
  fontSize: number
): { svg: string; width: number; height: number } {
  const pillWidth = estimateNamePillWidth(name, fontSize);
  const taglineFontSize = Math.round(fontSize * 0.4);
  const hasTagline = !!tagline?.trim();
  const paddingX = Math.round(fontSize * 0.6);
  const paddingY = Math.round(fontSize * 0.35);
  const lineGap = hasTagline ? Math.round(fontSize * 0.3) : 0;
  const pillHeight = fontSize + paddingY * 2 + (hasTagline ? taglineFontSize + lineGap : 0);

  const borderRadius = Math.round(fontSize * 0.25);

  let bgFill = 'white';
  let bgOpacity = '1';
  let textFill = '#111';
  let taglineFill = '#555';
  let strokeColor = 'none';
  let strokeWidth = '0';

  if (style === 'black_pill') {
    bgFill = '#111';
    textFill = 'white';
    taglineFill = 'rgba(255,255,255,0.8)';
  } else if (style === 'transparent_light') {
    bgFill = 'white';
    bgOpacity = '0';
    textFill = 'white';
    taglineFill = 'rgba(255,255,255,0.85)';
    strokeColor = 'rgba(0,0,0,0.6)';
    strokeWidth = '2';
  } else if (style === 'transparent_dark') {
    bgFill = 'black';
    bgOpacity = '0';
    textFill = '#111';
    taglineFill = '#444';
    strokeColor = 'rgba(255,255,255,0.75)';
    strokeWidth = '2';
  }

  const textY = paddingY + fontSize * 0.85;
  const taglineY = textY + taglineFontSize + lineGap;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${pillWidth}" height="${pillHeight}">
  ${bgOpacity !== '0' ? `<rect x="0" y="0" width="${pillWidth}" height="${pillHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${bgFill}" opacity="${bgOpacity}" />` : ''}
  <text
    x="${paddingX}"
    y="${textY}"
    font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    fill="${textFill}"
    stroke="${strokeColor}"
    stroke-width="${strokeWidth}"
    paint-order="stroke"
  >${xml(name)}</text>
  ${hasTagline ? `
  <text
    x="${paddingX}"
    y="${taglineY}"
    font-family="system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif"
    font-size="${taglineFontSize}"
    font-weight="500"
    fill="${taglineFill}"
    stroke="${strokeColor}"
    stroke-width="${style.startsWith('transparent') ? '1.5' : '0'}"
    paint-order="stroke"
  >${xml(tagline!)}</text>` : ''}
</svg>`.trim();

  return { svg, width: pillWidth, height: pillHeight };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;

    if (!body.productPhoto) return NextResponse.json({ error: 'productPhoto required' }, { status: 400 });
    if (!body.productName?.trim()) return NextResponse.json({ error: 'productName required' }, { status: 400 });
    if (!body.coilImageUrl) return NextResponse.json({ error: 'coilImageUrl required' }, { status: 400 });

    const aspect: Aspect = body.aspect || 'square';
    const { width, height } = ASPECT_SIZES[aspect];
    const nameStyle: NameStyle = body.nameStyle || 'white_pill';
    const padding = body.padding ?? 40;
    const coilBadgeSize = body.coilBadgeSize ?? 280;
    // Scale font size relative to canvas width so it reads at any aspect
    const fontSize = Math.round(width * 0.042);

    // 1. Load and cover-fit the product photo
    const productBuffer = await fetchBuffer(body.productPhoto);
    let bg = sharp(productBuffer).resize(width, height, { fit: 'cover', position: 'center' });

    if (body.dimBackground) {
      // Subtle top-down dim to keep the name/coil readable on bright photos
      const dimSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
        <defs>
          <linearGradient id="d" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="black" stop-opacity="0.35"/>
            <stop offset="40%" stop-color="black" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <rect width="${width}" height="${height}" fill="url(#d)"/>
      </svg>`;
      bg = sharp(await bg.png().toBuffer()).composite([{ input: Buffer.from(dimSvg), top: 0, left: 0 }]);
    }

    // 2. Build the product name pill
    const { svg: nameSvg } = buildNameSvg(body.productName, body.tagline, nameStyle, fontSize);
    const namePng = await sharp(Buffer.from(nameSvg)).png().toBuffer();
    const nameMeta = await sharp(namePng).metadata();

    // 3. Build the coil badge — white rounded square with the coil design inside
    const coilBuffer = await fetchBuffer(body.coilImageUrl);
    const innerSize = coilBadgeSize - Math.round(coilBadgeSize * 0.1); // 10% padding inside badge
    const coilInner = await sharp(coilBuffer)
      .resize(innerSize, innerSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toBuffer();

    // White rounded badge base with soft shadow
    const badgeRadius = Math.round(coilBadgeSize * 0.08);
    const badgeBaseSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${coilBadgeSize}" height="${coilBadgeSize}">
      <defs>
        <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.25"/>
        </filter>
      </defs>
      <rect
        x="4" y="4"
        width="${coilBadgeSize - 8}" height="${coilBadgeSize - 8}"
        rx="${badgeRadius}" ry="${badgeRadius}"
        fill="white"
        filter="url(#s)"
      />
    </svg>`;
    const badgeBase = await sharp(Buffer.from(badgeBaseSvg)).png().toBuffer();

    const coilBadge = await sharp(badgeBase)
      .composite([
        {
          input: coilInner,
          top: Math.round((coilBadgeSize - innerSize) / 2),
          left: Math.round((coilBadgeSize - innerSize) / 2),
        },
      ])
      .png()
      .toBuffer();

    // 4. Composite everything — name top-left, coil top-right
    const nameWidth = nameMeta.width || 400;
    // Ensure the name pill doesn't collide with the coil badge
    const nameMaxWidth = width - coilBadgeSize - padding * 3;
    let finalNamePng = namePng;
    if (nameWidth > nameMaxWidth) {
      // Resize the pill down proportionally if it's too wide
      finalNamePng = await sharp(namePng).resize({ width: nameMaxWidth }).png().toBuffer();
    }

    // Output PNG — the uploadImage helper labels everything as image/png, and
    // composites often include crisp text + flat badge fills that benefit
    // from lossless encoding.
    const composed = await bg
      .composite([
        { input: finalNamePng, top: padding, left: padding },
        { input: coilBadge, top: padding, left: width - coilBadgeSize - padding },
      ])
      .png({ compressionLevel: 8 })
      .toBuffer();

    // 5. Upload the final composite to Supabase
    const base64 = `data:image/png;base64,${composed.toString('base64')}`;
    const filenameHint = (body.filenameHint || body.productName || 'marketing')
      .replace(/[^a-zA-Z0-9\-_]/g, '-')
      .slice(0, 40);
    const folder = body.folder || 'marketing';

    let url: string;
    try {
      url = await uploadImage(base64, folder, `${filenameHint}-${aspect}`);
    } catch (err) {
      console.error('Marketing upload failed, falling back to base64 payload:', err);
      url = base64;
    }

    return NextResponse.json({ url, width, height });
  } catch (err) {
    console.error('Marketing graphic error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate marketing graphic' },
      { status: 500 }
    );
  }
}
