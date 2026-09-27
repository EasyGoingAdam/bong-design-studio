import { trace } from 'potrace';
import sharp from 'sharp';

/**
 * True vector SVG export for binary etch designs.
 *
 * Traces a binary black/white raster into real vector paths with Potrace (pure
 * JS, no native deps) — black fills on a white background, correct dimensions
 * and viewBox, no embedded raster. Because the input is already a 1-bit
 * production master, the trace is clean and 2-color.
 *
 * If tracing fails, callers fall back to the raster-in-SVG exporter and label
 * the result "Embedded Image SVG" rather than "Vector SVG".
 */
export interface TraceResult {
  svg: string;
  isVector: true;
  width: number;
  height: number;
}

export async function traceToSvg(input: Buffer, opts: { threshold?: number; background?: string } = {}): Promise<TraceResult> {
  // Ensure a flattened white-background PNG so tracing is deterministic.
  const png = await sharp(input).flatten({ background: '#ffffff' }).png().toBuffer();
  const meta = await sharp(png).metadata();

  const svg = await new Promise<string>((resolve, reject) => {
    trace(png, {
      color: '#000000',
      background: opts.background ?? '#ffffff',
      threshold: opts.threshold ?? 128,
      turdSize: 2,          // drop specks smaller than 2px (disconnected noise)
      optTolerance: 0.4,    // smooth curves a touch for cleaner paths
      turnPolicy: 'minority',
    }, (err, out) => (err ? reject(err) : resolve(out)));
  });

  return { svg, isVector: true, width: meta.width ?? 0, height: meta.height ?? 0 };
}
