import sharp from 'sharp';
import { enforceMonochromeBuffer, ENV_MONO_THRESHOLD } from './monochrome';

/**
 * Production-master processing for Bong Design Studio 2.0.
 *
 * Etch designs must be TRUE BINARY black/white — every production pixel is
 * either 0,0,0 or 255,255,255. The 2.0 pipeline runs the AI-raw image through
 * this to produce the "Production Master" the employee actually works with:
 *
 *   AI raw  →  toProductionMaster (binary threshold)  →  validateEtchingArtwork
 *
 * Threshold is a technical calibration value, never exposed as a user slider —
 * a sensible system default (128), overridable by the ETCH_MONO_THRESHOLD env /
 * admin setting. This is scoped to the 2.0 studio; the shared generation path
 * (bots, calendar, old studio) keeps its grayscale enforcement.
 */

/** System default binary threshold; env overrides it globally. */
export const DEFAULT_ETCH_THRESHOLD = ENV_MONO_THRESHOLD ?? 128;

export interface ProductionMaster {
  dataUri: string;      // binary B/W PNG data URI
  buffer: Buffer;       // same, raw PNG bytes
  width: number;
  height: number;
  blackCoverage: number; // fraction 0..1 of opaque pixels that are black
}

/** Convert any raster (data URI / base64 / Buffer) to a binary B/W master. */
export async function toProductionMaster(
  input: string | Buffer,
  opts: { threshold?: number } = {},
): Promise<ProductionMaster> {
  const threshold = opts.threshold ?? DEFAULT_ETCH_THRESHOLD;
  const buffer = await enforceMonochromeBuffer(input, { threshold });
  const { width, height, blackCoverage } = await measure(buffer);
  return { dataUri: `data:image/png;base64,${buffer.toString('base64')}`, buffer, width, height, blackCoverage };
}

/** Read pixel stats: dimensions + black coverage among opaque pixels. */
async function measure(png: Buffer): Promise<{ width: number; height: number; blackCoverage: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  let black = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue; // ignore transparent
    opaque++;
    // Post-binary the channels are equal; treat <128 luminance as black.
    if (data[i] < 128) black++;
  }
  const blackCoverage = opaque > 0 ? black / opaque : 0;
  return { width, height, blackCoverage };
}

export interface EtchingValidation {
  ok: boolean;
  isMonochrome: boolean;
  isBinary: boolean;
  width: number;
  height: number;
  aspectRatio: number;
  hasValidContent: boolean;
  blackCoverage: number;
  fileSize: number;
  warnings: string[];
}

/**
 * Validate a production-master image. Most of this is automatic; only genuine
 * "a human should look" cases produce warnings (near-blank / near-black / tiny
 * dimensions / wrong aspect ratio).
 */
export async function validateEtchingArtwork(
  input: string | Buffer,
  expected?: { aspectRatio?: number; minWidth?: number },
): Promise<EtchingValidation> {
  const buffer = typeof input === 'string'
    ? Buffer.from(input.startsWith('data:') ? input.slice(input.indexOf(',') + 1) : input, 'base64')
    : input;

  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const aspectRatio = height > 0 ? width / height : 0;

  let chroma = false;
  let nonBinary = false;
  let black = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (r !== g || g !== b) chroma = true;
    const lum = r; // channels equal when monochrome
    if (a >= 128) {
      opaque++;
      if (lum !== 0 && lum !== 255) nonBinary = true;
      if (lum < 128) black++;
    }
  }
  const blackCoverage = opaque > 0 ? black / opaque : 0;
  const isMonochrome = !chroma;
  const isBinary = isMonochrome && !nonBinary;

  const warnings: string[] = [];
  if (blackCoverage > 0.97) warnings.push('Artwork is almost completely black.');
  if (blackCoverage < 0.005) warnings.push('Artwork is almost completely white / blank.');
  if (expected?.aspectRatio && Math.abs(aspectRatio - expected.aspectRatio) / expected.aspectRatio > 0.25) {
    warnings.push('Aspect ratio differs noticeably from the target area.');
  }
  if (expected?.minWidth && width < expected.minWidth) {
    warnings.push('Image is smaller than the recommended size for this piece.');
  }
  const hasValidContent = blackCoverage >= 0.005 && blackCoverage <= 0.97;

  return {
    ok: isBinary && hasValidContent,
    isMonochrome, isBinary, width, height, aspectRatio,
    hasValidContent, blackCoverage, fileSize: buffer.length, warnings,
  };
}
