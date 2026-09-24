/**
 * Studio 2.0 production-pipeline tests. Run: `npm run test:studio`
 * Covers the binary production-master, the validator, and the canonical
 * etching-prompt builder (the pure, deterministic pieces).
 */
import sharp from 'sharp';
import { toProductionMaster, validateEtchingArtwork } from '../src/lib/production-master';
import { buildEtchingPrompt } from '../src/lib/etching-prompt';

let failures = 0;
const ok = (name: string, cond: boolean, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${name}${cond ? '' : `  — ${detail}`}`);
  if (!cond) failures++;
};

async function coloredSource(): Promise<Buffer> {
  const raw = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 30, 30, 30, 255]);
  return sharp(raw, { raw: { width: 4, height: 1, channels: 4 } }).png().toBuffer();
}
async function pixels(png: Buffer) {
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function main() {
  console.log('production master (binary):');
  {
    const src = await coloredSource();
    const master = await toProductionMaster(src);
    const data = await pixels(master.buffer);
    let bad = false;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (!(r === g && g === b) || !(r === 0 || r === 255)) { bad = true; break; }
    }
    ok('every production pixel is pure black or white', !bad);
    ok('blackCoverage is a fraction 0..1', master.blackCoverage >= 0 && master.blackCoverage <= 1, String(master.blackCoverage));
  }

  console.log('validator:');
  {
    const src = await coloredSource();
    const master = await toProductionMaster(src);
    const v = await validateEtchingArtwork(master.buffer);
    ok('reports monochrome + binary', v.isMonochrome && v.isBinary);
    // A nearly all-white image should warn.
    const white = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const wv = await validateEtchingArtwork(white);
    ok('flags near-blank artwork', wv.warnings.some((w) => /white|blank/i.test(w)) && !wv.hasValidContent);
  }

  console.log('etching prompt builder:');
  {
    const p = buildEtchingPrompt({ concept: 'a retro UFO', detailLevel: 'simple', shape: 'wrap', wrap: true, seamless: true });
    ok('always includes the engraving no-color rule', /no color/i.test(p) || /No color/.test(p));
    ok('translates wrap into wrap-around direction', /wrap-around/i.test(p) && /seamless/i.test(p));
    ok('translates detail=simple', /simple detail/i.test(p));
    ok('ends with a binary black-and-white reminder', /binary black-and-white/i.test(p));
    const set = buildEtchingPrompt({ concept: 'aliens', targetName: 'Base', designFamilyContext: { theme: 'Alien', visualStyle: 'pulp', lineStyle: 'bold', density: 'balanced', sharedElements: ['stars'] } });
    ok('coordinated set injects the family brief', /coordinated set/i.test(set) && /stars/i.test(set));
  }

  console.log(failures === 0 ? '\nAll studio tests passed.' : `\n${failures} test(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
