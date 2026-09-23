import sharp from 'sharp';

/**
 * Monochrome enforcement for laser-etch designs.
 *
 * Every generated / exported etch design MUST be black-and-white with zero
 * chroma. Prompts ask the image models for pure B&W, but gpt-image-1/2 and
 * Gemini regularly return anti-aliased grays or subtle color tints — the prompt
 * is a request, not a guarantee. This module is the guarantee: a hard
 * pixel-level pass that strips all color before an image is ever stored.
 *
 *  - `grayscale()` collapses RGB to a single luminance channel → no chroma,
 *    ever. This is always applied (the non-negotiable floor).
 *  - An optional threshold converts to pure 1-bit black/white for the crispest
 *    etch. Off by default (grayscale preserves fine tonal line-work); enable it
 *    globally with env `ETCH_MONO_THRESHOLD` (0–255) or per-call.
 *  - The alpha channel is preserved, so an intentionally transparent background
 *    survives untouched — only chroma is removed.
 */

export interface MonoOptions {
  /** 0–255 to threshold to pure black/white (1-bit); null/undefined = grayscale only. */
  threshold?: number | null;
}

/** Global default threshold from env (opt-in), or null for grayscale-only. */
export const ENV_MONO_THRESHOLD: number | null = (() => {
  const v = process.env.ETCH_MONO_THRESHOLD;
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(255, Math.max(0, n)) : null;
})();

/** Turn a data URI or bare base64 string into a Buffer. */
function toBuffer(input: string | Buffer): Buffer {
  if (Buffer.isBuffer(input)) return input;
  const comma = input.indexOf(',');
  const b64 = input.startsWith('data:') && comma >= 0 ? input.slice(comma + 1) : input;
  return Buffer.from(b64, 'base64');
}

/** Wrap a PNG buffer as a data URI. */
function toDataUri(buf: Buffer): string {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

/**
 * Force a raster image to monochrome. Returns a PNG data URI. Never throws into
 * the generation path — on any failure the original bytes are returned as a
 * data URI (a stored-but-untouched image is better than a lost generation).
 */
export async function enforceMonochrome(input: string | Buffer, opts: MonoOptions = {}): Promise<string> {
  try {
    return toDataUri(await enforceMonochromeBuffer(input, opts));
  } catch (err) {
    console.warn('[monochrome] enforce failed, using original:', err instanceof Error ? err.message : err);
    const buf = toBuffer(input);
    return toDataUri(buf);
  }
}

/**
 * Core transform returning a raw PNG buffer. Separated so tests can inspect
 * pixels directly. Throws on genuine sharp failures.
 */
export async function enforceMonochromeBuffer(input: string | Buffer, opts: MonoOptions = {}): Promise<Buffer> {
  const buf = toBuffer(input);
  const threshold = opts.threshold === undefined ? ENV_MONO_THRESHOLD : opts.threshold;
  const meta = await sharp(buf).metadata();

  if (threshold == null) {
    // Grayscale only — collapses chroma, keeps the alpha channel automatically.
    return sharp(buf).grayscale().png().toBuffer();
  }

  const t = Math.min(255, Math.max(0, threshold));
  if (meta.hasAlpha) {
    // Threshold the color channels but keep the original alpha, so a
    // transparent background stays transparent instead of becoming black/white.
    const alpha = await sharp(buf).ensureAlpha().extractChannel(3).toColourspace('b-w').toBuffer();
    const bw = await sharp(buf).removeAlpha().grayscale().threshold(t).toBuffer();
    return sharp(bw).joinChannel(alpha).png().toBuffer();
  }
  return sharp(buf).grayscale().threshold(t).png().toBuffer();
}
