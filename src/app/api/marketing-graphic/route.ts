import { NextRequest, NextResponse } from 'next/server';

// Image generation/processing can take minutes — without this the
// platform's default 60s function timeout kills slow renders mid-flight.
export const maxDuration = 300;
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { uploadImage } from '@/lib/supabase';

// sharp is dynamically imported below — it's a 30MB native module and
// only matters when this route is hit. Static import was loading it on
// every cold start of any neighboring route in the same lambda group.

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
  // Manual rotation applied to the product photo BEFORE cover-fit. Useful
  // when EXIF orientation isn't present (e.g. sideloaded screenshots) and
  // the photo lands sideways. Multiples of 90 only.
  rotateDeg?: 0 | 90 | 180 | 270;
}

const ASPECT_SIZES: Record<Aspect, { width: number; height: number }> = {
  square: { width: 1200, height: 1200 },
  portrait: { width: 1080, height: 1350 },   // Instagram portrait
  landscape: { width: 1600, height: 1000 },
  story: { width: 1080, height: 1920 },      // Instagram/TikTok story
};

/**
 * Marketing-graphic text rendering — pure path approach.
 *
 * Why not SVG <text> with @font-face / fontfile?
 *   - librsvg (sharp's SVG renderer) ignores CSS @font-face entirely
 *   - sharp's native text renderer goes through Pango+fontconfig, which
 *     requires the host OS to have the font installed
 *   - Railway's Linux containers don't reliably ship Inter / DejaVu /
 *     any specific sans-serif → missing-glyph rectangles ("black boxes")
 *
 * Fix: use text-to-svg + opentype.js to convert each string into literal
 * SVG <path d="..."> elements at request time. The font's vector glyphs
 * are read from the bundled TTF and emitted as ordinary paths librsvg
 * can render without any font-system involvement. Output is identical
 * regardless of host.
 *
 * Bundled font lives at src/assets/fonts/Inter-{Regular,Bold}.ttf (the
 * actual file content is DejaVu Sans — kept the filename generic so we
 * can hot-swap the font without touching call sites). Loaded once per
 * process via text-to-svg's loadSync; ~50ms cold, ~0ms warm.
 */
import TextToSVG from 'text-to-svg';

let TTS_BOLD: TextToSVG | null = null;
let TTS_REGULAR: TextToSVG | null = null;

function getTextToSvg(weight: 'bold' | 'regular'): TextToSVG | null {
  try {
    const dir = join(process.cwd(), 'src', 'assets', 'fonts');
    if (weight === 'bold') {
      if (!TTS_BOLD) TTS_BOLD = TextToSVG.loadSync(join(dir, 'Inter-Bold.ttf'));
      return TTS_BOLD;
    } else {
      if (!TTS_REGULAR) TTS_REGULAR = TextToSVG.loadSync(join(dir, 'Inter-Regular.ttf'));
      return TTS_REGULAR;
    }
  } catch (err) {
    console.error('[marketing-graphic] Failed to load bundled font (', weight, '):', err);
    return null;
  }
}

/**
 * Render `text` as an SVG <path> + return both the <path …/> markup and
 * the measured bounding box. Path coords are anchored at top-left so
 * the caller can place it wherever it wants.
 */
interface TextPath {
  pathEl: string;
  width: number;
  height: number;
}

/**
 * Tracks whether the bundled fonts loaded successfully on this process.
 * `null` = not attempted yet, `true` = at least one weight loaded,
 * `false` = both weights failed. Used by the route POST handler to
 * fail loudly (with a clear error message) rather than silently rendering
 * a marketing graphic with no text — which was the silent bug the audit
 * surfaced.
 */
let FONT_LOAD_OK: boolean | null = null;
function ensureFontsLoaded(): boolean {
  if (FONT_LOAD_OK !== null) return FONT_LOAD_OK;
  const bold = getTextToSvg('bold');
  const reg = getTextToSvg('regular');
  FONT_LOAD_OK = !!(bold && reg);
  return FONT_LOAD_OK;
}

function renderTextAsPath(
  text: string,
  weight: 'bold' | 'regular',
  fontSize: number,
  fill: string,
  stroke?: { color: string; width: number }
): TextPath {
  const tts = getTextToSvg(weight);
  if (!tts) {
    // Defensive — should never hit unless the bundled font is missing.
    return { pathEl: '', width: 0, height: 0 };
  }
  const attrs: Record<string, string> = { fill };
  if (stroke && stroke.width > 0) {
    attrs.stroke = stroke.color;
    attrs['stroke-width'] = String(stroke.width);
    attrs['paint-order'] = 'stroke';
  }
  const m = tts.getMetrics(text, { fontSize });
  const pathEl = tts.getPath(text, {
    x: 0,
    y: 0,
    fontSize,
    anchor: 'left top',
    attributes: attrs,
  });
  return {
    pathEl,
    width: Math.ceil(m.width),
    height: Math.ceil(m.height),
  };
}

// Escape XML special chars so product names with &, <, >, etc. don't break the SVG
function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Width estimate kept as a fallback only — buildNameSvg now uses the
// real measured width from text-to-svg's getMetrics().
function estimateNamePillWidth(text: string, fontSize: number): number {
  const estimatedTextWidth = Math.min(text.length, 30) * fontSize * 0.55;
  return Math.round(estimatedTextWidth + fontSize * 1.2);
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
  const taglineFontSize = Math.round(fontSize * 0.4);
  const hasTagline = !!tagline?.trim();
  const paddingX = Math.round(fontSize * 0.6);
  const paddingY = Math.round(fontSize * 0.35);
  const lineGap = hasTagline ? Math.round(fontSize * 0.3) : 0;
  const borderRadius = Math.round(fontSize * 0.25);

  let bgFill = 'white';
  let bgOpacity = '1';
  let textFill = '#111';
  let taglineFill = '#555';
  let strokeColor = 'none';
  let strokeWidth = 0;
  let taglineStrokeWidth = 0;

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
    strokeWidth = 2;
    taglineStrokeWidth = 1.5;
  } else if (style === 'transparent_dark') {
    bgFill = 'black';
    bgOpacity = '0';
    textFill = '#111';
    taglineFill = '#444';
    strokeColor = 'rgba(255,255,255,0.75)';
    strokeWidth = 2;
    taglineStrokeWidth = 1.5;
  }

  // Render the name + tagline as REAL SVG paths derived from the
  // bundled TTF's glyph outlines. No host fonts needed.
  const nameRender = renderTextAsPath(
    name,
    'bold',
    fontSize,
    textFill,
    strokeWidth > 0 ? { color: strokeColor, width: strokeWidth } : undefined
  );
  const taglineRender = hasTagline
    ? renderTextAsPath(
        tagline!,
        'regular',
        taglineFontSize,
        taglineFill,
        taglineStrokeWidth > 0 ? { color: strokeColor, width: taglineStrokeWidth } : undefined
      )
    : null;

  // Pill width = widest line + horizontal padding ×2. Fall back to the
  // old character-based estimate if the path renderer didn't return a
  // measurement (font missing).
  const measuredTextWidth = Math.max(
    nameRender.width,
    taglineRender?.width || 0
  );
  const pillWidth = measuredTextWidth > 0
    ? measuredTextWidth + paddingX * 2
    : estimateNamePillWidth(name, fontSize);
  const pillHeight = fontSize + paddingY * 2 + (hasTagline ? taglineFontSize + lineGap : 0);

  // Path is anchored at top-left of its own bounding box. Translate
  // groups into position via SVG <g transform>.
  const nameTranslateY = paddingY;
  const taglineTranslateY = nameTranslateY + fontSize + lineGap;

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${pillWidth}" height="${pillHeight}">
  ${bgOpacity !== '0' ? `<rect x="0" y="0" width="${pillWidth}" height="${pillHeight}" rx="${borderRadius}" ry="${borderRadius}" fill="${bgFill}" opacity="${bgOpacity}" />` : ''}
  ${nameRender.pathEl
    ? `<g transform="translate(${paddingX}, ${nameTranslateY})">${nameRender.pathEl}</g>`
    : ''}
  ${taglineRender?.pathEl
    ? `<g transform="translate(${paddingX}, ${taglineTranslateY})">${taglineRender.pathEl}</g>`
    : ''}
</svg>`.trim();

  return { svg, width: pillWidth, height: pillHeight };
}

// Keep xml() exported intent — still used elsewhere for any future SVG
// text fallback. The unused-import linter complains otherwise.
void xml;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Body;

    if (!body.productPhoto) return NextResponse.json({ error: 'productPhoto required' }, { status: 400 });
    if (!body.productName?.trim()) return NextResponse.json({ error: 'productName required' }, { status: 400 });
    if (!body.coilImageUrl) return NextResponse.json({ error: 'coilImageUrl required' }, { status: 400 });

    // BUG FIX: fail loudly if the bundled TTFs didn't load. Without this
    // we'd render a marketing graphic with an empty pill (no name text)
    // and the user would never know why. Better to 500 with a clear
    // error so the UI can surface "fonts unavailable, retry".
    if (!ensureFontsLoaded()) {
      return NextResponse.json(
        { error: 'Marketing fonts failed to load on the server — try again, or contact ops if it persists.' },
        { status: 500 }
      );
    }

    const aspect: Aspect = body.aspect || 'square';
    const { width, height } = ASPECT_SIZES[aspect];
    const nameStyle: NameStyle = body.nameStyle || 'white_pill';
    const padding = body.padding ?? 40;
    const coilBadgeSize = body.coilBadgeSize ?? 280;
    // Scale font size relative to canvas width so it reads at any aspect
    const fontSize = Math.round(width * 0.042);

    // Dynamic import — see top-of-file comment.
    const sharp = (await import('sharp')).default;

    // 1. Load + (a) respect EXIF orientation so portrait phone photos
    // don't land sideways, (b) apply optional manual rotation, then
    // cover-fit to the canvas. Without .rotate() the EXIF was being
    // stripped silently and portrait shots came through landscape.
    const productBuffer = await fetchBuffer(body.productPhoto);
    const rotateDeg = body.rotateDeg ?? 0;
    let bg = sharp(productBuffer)
      .rotate() // EXIF auto-orient — must come BEFORE any other transform
      .rotate(rotateDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .resize(width, height, { fit: 'cover', position: 'center' });

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
