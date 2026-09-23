/**
 * Monochrome-enforcement tests. Run: `npm run test:monochrome`
 * (uses tsx via npx; no test framework is installed in this repo).
 *
 * Verifies the hard pixel-level guarantee that every etch design is colorless:
 *   1. grayscale-only output has zero chroma (R===G===B on every pixel)
 *   2. threshold output is pure 1-bit black/white (every pixel 0 or 255)
 *   3. a transparent background survives both passes
 *   4. the v1 OpenAI prompt carries the monochrome reinforcement tail
 */
import sharp from 'sharp';
import { enforceMonochromeBuffer } from '../src/lib/monochrome';
import { getOpenAIRequestBody, MONO_PROMPT_TAIL } from '../src/lib/ai-providers';

let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : `  — ${detail}`}`);
  if (!cond) failures++;
};

/** Build a 4×1 RGBA image: red, green, blue, and a fully transparent pixel. */
async function coloredSource(): Promise<Buffer> {
  const raw = Buffer.from([
    255, 0, 0, 255,   // red
    0, 255, 0, 255,   // green
    0, 0, 255, 255,   // blue
    0, 0, 0, 0,       // transparent
  ]);
  return sharp(raw, { raw: { width: 4, height: 1, channels: 4 } }).png().toBuffer();
}

/** Decode a PNG to flat RGBA pixels. */
async function pixels(png: Buffer): Promise<{ data: Buffer; channels: number }> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, channels: info.channels };
}

async function main() {
  const src = await coloredSource();

  console.log('grayscale-only (default):');
  {
    const out = await enforceMonochromeBuffer(src); // no threshold
    const { data } = await pixels(out);
    let chroma = false;
    for (let i = 0; i < data.length; i += 4) {
      if (!(data[i] === data[i + 1] && data[i + 1] === data[i + 2])) { chroma = true; break; }
    }
    ok('no chroma (R===G===B on every pixel)', !chroma, 'a pixel still had differing channels');
    ok('transparent pixel stays transparent', data[3 * 4 + 3] === 0, `alpha=${data[3 * 4 + 3]}`);
    // Opaque colored pixels must NOT all collapse to 0/255 in grayscale mode (they become mid grays).
    ok('grayscale preserves tone (not forced 1-bit)', [data[0], data[4], data[8]].some((v) => v !== 0 && v !== 255), 'all values were 0/255');
  }

  console.log('threshold = 128 (1-bit):');
  {
    const out = await enforceMonochromeBuffer(src, { threshold: 128 });
    const { data } = await pixels(out);
    let bad = -1;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r === g && g === b) || !(r === 0 || r === 255)) { bad = i; break; }
    }
    ok('every pixel is pure black or pure white', bad === -1, bad >= 0 ? `pixel@${bad}=(${data[bad]},${data[bad + 1]},${data[bad + 2]})` : '');
    ok('transparent pixel stays transparent through threshold', data[3 * 4 + 3] === 0, `alpha=${data[3 * 4 + 3]}`);
  }

  console.log('prompt reinforcement:');
  {
    const body = getOpenAIRequestBody({
      prompt: 'a mushroom', provider: 'openai', apiKey: 'x', size: '1024x1024', quality: 'medium', folder: 'f', filename: 'n',
    });
    const p = String(body.prompt);
    ok('v1 prompt appends the monochrome tail', p.endsWith(MONO_PROMPT_TAIL), p.slice(-40));
    ok('tail forbids color explicitly', /no color/i.test(MONO_PROMPT_TAIL));
  }

  console.log(failures === 0 ? '\nAll monochrome tests passed.' : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
