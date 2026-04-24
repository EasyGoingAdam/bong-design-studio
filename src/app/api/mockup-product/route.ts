import { NextRequest, NextResponse } from 'next/server';
import { uploadImage } from '@/lib/supabase';
import { callOpenAIImageEdit, openAIErrorResponse } from '@/lib/openai';
import { PROVIDER_CONFIG } from '@/lib/ai-providers';

/**
 * Render a photorealistic mockup of a blank product with the etched design
 * applied. Uses OpenAI's gpt-image-1 /v1/images/edits with MULTIPLE source
 * images — the model composes the blank product + coil design + base design
 * into a single believable etched output.
 *
 * Body:
 *   blankProductUrl    — photo of the un-etched product
 *   coilDesignUrl      — the coil (cylindrical) design asset
 *   baseDesignUrl?     — the base design asset (optional)
 *   apiKey             — OpenAI key
 *   angle              — front | three_quarter_left | three_quarter_right | side | back | top
 *   etchStyle          — frosted | deep | shallow | filled_black
 *   placement          — auto | wrap | front_panel | band_top | band_bottom
 *   background         — keep | white_studio | gradient | lifestyle
 *   size?              — 1024x1024 | 1024x1536 | 1536x1024
 *   editInstruction?   — optional free-text tweak appended to the prompt
 *   folder?, filename? — storage naming
 */
type Angle = 'front' | 'three_quarter_left' | 'three_quarter_right' | 'side' | 'back' | 'top';
type EtchStyle = 'frosted' | 'deep' | 'shallow' | 'filled_black';
type Placement = 'auto' | 'wrap' | 'front_panel' | 'band_top' | 'band_bottom';
type Background = 'keep' | 'white_studio' | 'gradient' | 'lifestyle';

const ANGLE_PHRASE: Record<Angle, string> = {
  front: 'Render from a direct front-on camera angle, product centered and square to the lens.',
  three_quarter_left: 'Render from a three-quarter angle with the LEFT side of the product rotated toward the camera (approx 30°).',
  three_quarter_right: 'Render from a three-quarter angle with the RIGHT side of the product rotated toward the camera (approx 30°).',
  side: 'Render from a pure profile side view, 90° rotation from the front.',
  back: 'Render from the back of the product, 180° from the front.',
  top: 'Render from a slight top-down camera angle (approx 15° above horizontal) looking down at the product.',
};

const ETCH_PHRASE: Record<EtchStyle, string> = {
  frosted:
    'The design must appear as FROSTED LASER ETCHING on clear glass — slightly opaque white-cream frost where etched, fully transparent where untouched. Photorealistic frost appearance with a faint soft-edge diffusion.',
  deep:
    'The design must appear as DEEP LASER ETCHING — high-contrast opaque white etching on clear glass, strong visibility from any angle, crisp edges, clear depth cue.',
  shallow:
    'The design must appear as SHALLOW surface etching — subtle, delicate frosting that only reads clearly in reflected light, low contrast on clear glass.',
  filled_black:
    'The design must appear as INFILL BLACK ETCHING — solid black pigment filling the etched recesses, high-contrast against the clear glass.',
};

const PLACEMENT_PHRASE: Record<Placement, string> = {
  auto:
    'Apply the coil design in the most natural location on the cylindrical body, with its orientation and scale chosen to flatter the product shape.',
  wrap:
    'The coil design must wrap continuously around the full cylindrical body of the product, repeating or flowing seamlessly as needed to cover the visible surface.',
  front_panel:
    'Apply the coil design as a single centered panel on the visible front of the cylindrical body — not wrapping around. Keep the rest of the glass clear.',
  band_top:
    'Apply the coil design as a horizontal band around the upper third of the cylindrical body only.',
  band_bottom:
    'Apply the coil design as a horizontal band around the lower third of the cylindrical body only.',
};

const BACKGROUND_PHRASE: Record<Background, string> = {
  keep: 'Preserve the background of the source photo exactly as it was — do not alter lighting, backdrop, or shadows.',
  white_studio: 'Replace the background with a clean seamless pure-white studio backdrop with a subtle floor shadow.',
  gradient: 'Replace the background with a soft neutral gradient (light gray to near-white) that complements the product.',
  lifestyle: 'Place the product in a tasteful lifestyle context — wood surface, soft natural daylight, minimal styling. The product remains the hero.',
};

async function fetchAsPng(src: string): Promise<Buffer> {
  let buf: Buffer;
  if (src.startsWith('data:')) {
    const m = src.match(/^data:[^;]+;base64,(.+)$/);
    if (!m) throw new Error('Invalid data URI');
    buf = Buffer.from(m[1], 'base64');
  } else {
    const r = await fetch(src);
    if (!r.ok) throw new Error(`Could not fetch source image (${r.status})`);
    buf = Buffer.from(await r.arrayBuffer());
  }
  // Normalize everything to PNG so the multipart form is always consistent.
  // gpt-image-1 edits accept png/webp/jpeg, but we standardize to png.
  try {
    const sharp = (await import('sharp')).default;
    const meta = await sharp(buf).metadata();
    if (meta.format !== 'png') {
      buf = await sharp(buf).png().toBuffer();
    }
    // Keep under 15 MB (OpenAI limit is 20 MB, give ourselves headroom)
    if (buf.length > 15 * 1024 * 1024) {
      buf = await sharp(buf).resize(2048, 2048, { fit: 'inside' }).png().toBuffer();
    }
  } catch (err) {
    console.warn('sharp normalize failed, sending raw buffer', err);
  }
  return buf;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      blankProductUrl,
      coilDesignUrl,
      baseDesignUrl,
      apiKey,
      angle = 'three_quarter_right',
      etchStyle = 'frosted',
      placement = 'auto',
      background = 'keep',
      size = '1024x1024',
      editInstruction = '',
      folder = 'mockups',
      filename = 'mockup',
    } = body as {
      blankProductUrl?: string;
      coilDesignUrl?: string;
      baseDesignUrl?: string;
      apiKey?: string;
      angle?: Angle;
      etchStyle?: EtchStyle;
      placement?: Placement;
      background?: Background;
      size?: string;
      editInstruction?: string;
      folder?: string;
      filename?: string;
    };

    if (!blankProductUrl) return NextResponse.json({ error: 'blankProductUrl required' }, { status: 400 });
    if (!coilDesignUrl) return NextResponse.json({ error: 'coilDesignUrl required (generate the coil design first)' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key required' }, { status: 400 });

    const validSizes = ['1024x1024', '1024x1536', '1536x1024'];
    const safeSize = validSizes.includes(size) ? size : '1024x1024';

    // Build the prompt. gpt-image-1 responds well to structured instructions.
    const promptParts = [
      'COMPOSITE TASK — render a photorealistic mockup of a blank glass product WITH a laser-etched design applied.',
      'INPUT IMAGES, in order:',
      '  1) The BLANK product photo (the base / canvas).',
      '  2) The COIL design asset — a black-on-white graphic meant to be etched on the cylindrical body of the product.',
      baseDesignUrl ? '  3) The BASE design asset — a black-on-white graphic meant to be etched on the circular base piece.' : '',
      '',
      'CRITICAL RULES:',
      '  - PRESERVE the exact product shape, proportions, silhouette, and size from image 1. Do not re-invent the product.',
      '  - Apply the design as ETCHED GLASS — the black pixels of the design become the etched regions. See the etching-style rules below.',
      '  - The etched pattern must follow the natural curvature of the glass, not appear as a flat sticker or decal.',
      '  - Maintain photorealistic glass material: transparency, refractions, subtle highlights, realistic shadows on the surrounding surface.',
      '  - Do NOT add text, logos, or any design elements not present in the source design images.',
      '  - Output must be photography-grade — no illustration, no cartoon, no 3D render aesthetic.',
      '',
      `ETCHING STYLE: ${ETCH_PHRASE[etchStyle]}`,
      `PLACEMENT: ${PLACEMENT_PHRASE[placement]}`,
      baseDesignUrl ? 'Also apply the BASE design to any visible circular base piece of the product (bottom disk, bowl base, etc.), again as etched glass, following its curvature.' : '',
      `CAMERA ANGLE: ${ANGLE_PHRASE[angle]}`,
      `BACKGROUND: ${BACKGROUND_PHRASE[background]}`,
      '',
      editInstruction ? `ADDITIONAL ADJUSTMENT: ${editInstruction}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    // Fetch every source image as a normalized PNG buffer
    const [blankBuf, coilBuf, baseBuf] = await Promise.all([
      fetchAsPng(blankProductUrl),
      fetchAsPng(coilDesignUrl),
      baseDesignUrl ? fetchAsPng(baseDesignUrl) : Promise.resolve(null),
    ]);

    // Build multipart form-data. gpt-image-1's edit endpoint supports an
    // image[] array so multiple sources are composed by the model.
    const formData = new FormData();
    formData.append('model', PROVIDER_CONFIG.openai.model);
    formData.append('prompt', promptParts);
    formData.append('n', '1');
    formData.append('size', safeSize);
    formData.append('quality', 'high'); // always high for final-look mockups

    // First image is the primary "canvas" — the blank product.
    formData.append('image[]', new Blob([new Uint8Array(blankBuf)], { type: 'image/png' }), 'blank.png');
    formData.append('image[]', new Blob([new Uint8Array(coilBuf)], { type: 'image/png' }), 'coil.png');
    if (baseBuf) {
      formData.append('image[]', new Blob([new Uint8Array(baseBuf)], { type: 'image/png' }), 'base.png');
    }

    // Longer timeout — mockups run at quality=high and take 30–120s
    const imageData = await callOpenAIImageEdit(formData, apiKey, 180_000);

    let base64: string;
    if (imageData.b64_json) {
      base64 = `data:image/png;base64,${imageData.b64_json}`;
    } else if (imageData.url) {
      const imgRes = await fetch(imageData.url);
      const imgBuffer = await imgRes.arrayBuffer();
      base64 = `data:image/png;base64,${Buffer.from(imgBuffer).toString('base64')}`;
    } else {
      return NextResponse.json({ error: 'OpenAI returned no image payload' }, { status: 500 });
    }

    // Upload to Supabase
    let url: string;
    try {
      const safe = (filename || 'mockup').replace(/[^a-zA-Z0-9\-_]/g, '-').slice(0, 40);
      url = await uploadImage(base64, folder, `${safe}-${angle}-${etchStyle}`);
    } catch (err) {
      console.error('Mockup upload failed, falling back to base64:', err);
      url = base64;
    }

    return NextResponse.json({ url, prompt: promptParts, angle, etchStyle });
  } catch (err) {
    const { body, status } = openAIErrorResponse(err);
    console.error('Mockup render error:', err);
    return NextResponse.json(body, { status });
  }
}
