import { CoilBaseRelationship, GenerationMode } from './types';

interface PromptInputs {
  title: string;
  stylePrompt: string;
  themePrompt: string;
  references: string;
  constraints: string;
  complexityLevel: number;
  coilInstructions: string;
  baseInstructions: string;
  relationship: CoilBaseRelationship;
  mode: GenerationMode;
  patternDensity: string;
  contrast: string;
  baseShape?: 'circle' | 'oval' | 'square' | 'rectangle';
  /** Coil canvas orientation. 'rectangle' = wide horizontal landscape;
   *  'square' = 1:1 aspect. Drives the hardest constraint we put on the
   *  model — orientation drift is the #1 failure mode otherwise. */
  coilShape?: 'square' | 'rectangle';
}

/**
 * Single source of truth for the engraving constraints. Everything that
 * asks an AI to PRODUCE a new design (generate, regenerate, preset gen)
 * uses `forGeneration`. Everything that asks an AI to EDIT an existing
 * design uses `forEdit` (shorter — assumes context already established).
 * Anything that asks an AI to REVIEW an image uses `forReview` (framed
 * as criteria, not instructions).
 *
 * Previously these rules were repeated in 5 different files with subtle
 * drift. Now if the rules change, they change in one place.
 */
export const ENGRAVING_RULES = {
  forGeneration: [
    'ENGRAVING MODE — output must be production-ready for laser etching on glass.',
    'Pure white background. Subject rendered in solid pure black.',
    'High contrast only. No gray wash, no soft gradients, no halftones, no photographic shading.',
    'No color. No tints. No chromatic detail.',
    'Clean line hierarchy. Avoid chaotic micro-details that will not resolve at print size.',
    'No text, words, numbers, labels, measurements, watermarks, or rulers in the image.',
    'No 3D product mockups. Render the design itself, not a rendering of it on a bong.',
    'Artwork must fill the frame edge to edge — no borders, no white padding around the composition.',
  ].join(' '),

  forEdit:
    'ENGRAVING MODE: Pure white background. Solid black subject. No color, no gradients, no gray wash, no photographic shading. High contrast, clean line hierarchy.',

  forReview: [
    'Pure black on pure white only — NO gray wash, NO shading, NO color',
    'Solid continuous lines, no broken or dotted edges',
    'Line weights ≥ 0.3mm at actual print size',
    'Negative space between elements ≥ 0.4mm',
    'No micro-details that won\'t resolve at etch size',
    'Strong silhouette and clear focal hierarchy',
    'No gradients, halftones, or photographic shading',
    'Artwork fills frame edge-to-edge (no borders, no padding)',
  ],
} as const;

// Alias kept for clarity in existing callers
const CORE = ENGRAVING_RULES.forGeneration;

const PREMIUM_MOTIFS = [
  'Art Deco geometry with bold angular lines and sunburst motifs',
  'Baroque filigree with ornate scrollwork and curving flourishes',
  'Rococo florals with delicate asymmetric botanical details',
  'Greek key meander with classical border elements',
  'Minimalist luxury with clean lines and strategic negative space',
  'Damask interlocking floral and vine repeats',
  'Filigree lace with ultra-fine interconnected patterns',
  'Art Nouveau organic flowing lines with stylized natural forms',
  'Gothic tracery with pointed arches and rose window elements',
  'Japanese Mon-style geometric family crest motifs',
  'Celtic knotwork with continuous interlacing bands',
  'Moroccan zellige-inspired geometric tile patterns',
];

function getModeDesc(mode: GenerationMode): string {
  switch (mode) {
    case 'concept_art': return 'Detailed B&W concept illustration, creative freedom encouraged.';
    case 'production_bw': return 'Production-ready black-and-white design for laser etching on clear glass. White background only. Main subject rendered in solid black. Clean bold line hierarchy. Controlled line density that will read cleanly at actual print size. No muddy midtones. No chaotic fine texture.';
    case 'pattern_wrap': return 'Seamless repeating B&W pattern for cylindrical wrapping.';
    case 'premium_luxury': return `Ornate luxury B&W design: ${PREMIUM_MOTIFS[Math.floor(Math.random() * PREMIUM_MOTIFS.length)]}.`;
    case 'seasonal_drop': return 'Bold B&W seasonal/holiday themed design for laser etching.';
    default: return 'B&W design for laser etching on glass.';
  }
}

const RELATIONSHIP_SHORT: Record<CoilBaseRelationship, string> = {
  exact_match: 'Coil and base must match exactly — same visual language.',
  mirror: 'Coil and base should mirror/invert each other.',
  thematic: 'Same theme family, distinct compositions.',
  loose: 'Loose visual connection, complementary mood.',
  complementary: 'Complement each other — detailed vs minimal balance.',
  contrast: 'Deliberate contrast with one unifying element.',
  continuation: 'Base continues the coil artwork as one flowing composition.',
  independent: 'Independent standalone artworks, no coordination needed.',
};

export function buildCoilPrompt(inputs: PromptInputs): string {
  const parts: string[] = [CORE, getModeDesc(inputs.mode)];

  if (inputs.references || inputs.constraints) {
    const dirs = [inputs.references, inputs.constraints].filter(Boolean).join('. ');
    parts.push(`MUST FOLLOW: ${dirs}`);
  }

  // Orientation is the strongest constraint we can give the model — image
  // models routinely default to a portrait-leaning composition unless
  // told otherwise, and that breaks coil wraps. Repeat the constraint
  // multiple times in different language so it overpowers any contrary
  // signal coming from the user's free-text instructions or dimensions.
  if (inputs.coilShape === 'rectangle') {
    parts.push(
      'CRITICAL CANVAS ORIENTATION: WIDE HORIZONTAL LANDSCAPE composition. ' +
      'The artwork must be SIGNIFICANTLY WIDER than tall (roughly 3:2 or wider). ' +
      'Compose the design as a flat rectangular STRIP that unrolls a cylindrical coil sleeve — ' +
      'long horizontal axis, short vertical axis. ' +
      'The design must FILL the wide landscape canvas edge-to-edge horizontally. ' +
      'Do NOT center a portrait composition inside the wide canvas. ' +
      'Do NOT add vertical bars or padding on the left and right.'
    );
  } else {
    parts.push('Flat SQUARE artwork (1:1 aspect ratio) for a coil sleeve. Compose to fill the square canvas evenly.');
  }

  if (inputs.title) parts.push(`Concept: "${inputs.title}".`);
  if (inputs.stylePrompt) parts.push(`Style: ${inputs.stylePrompt}.`);
  if (inputs.themePrompt) parts.push(`Theme: ${inputs.themePrompt}.`);
  if (inputs.coilInstructions) parts.push(`Coil: ${inputs.coilInstructions}.`);
  parts.push(RELATIONSHIP_SHORT[inputs.relationship]);
  if (inputs.complexityLevel <= 2) parts.push('Simple, clean, minimal detail.');
  else if (inputs.complexityLevel >= 4) parts.push('Highly detailed and intricate.');
  if (inputs.contrast === 'high') parts.push('Maximum contrast.');

  // Reinforce orientation at the END too — last instruction tends to
  // weight heaviest in image-gen models.
  if (inputs.coilShape === 'rectangle') {
    parts.push('Final reminder: WIDE HORIZONTAL LANDSCAPE — wider than tall, never portrait.');
  }

  return parts.join(' ');
}

export function buildBasePrompt(inputs: PromptInputs): string {
  const shape = inputs.baseShape || 'circle';
  const shapeWord = shape === 'circle' ? 'circular' : shape === 'oval' ? 'oval (elliptical)' : shape === 'square' ? 'square' : 'rectangular (wider than tall)';
  const parts: string[] = [CORE, getModeDesc(inputs.mode)];

  if (inputs.references || inputs.constraints) {
    const dirs = [inputs.references, inputs.constraints].filter(Boolean).join('. ');
    parts.push(`MUST FOLLOW: ${dirs}`);
  }

  parts.push(`Flat ${shapeWord} artwork for a base piece.`);
  if (inputs.title) parts.push(`Concept: "${inputs.title}".`);
  if (inputs.stylePrompt) parts.push(`Style: ${inputs.stylePrompt}.`);
  if (inputs.themePrompt) parts.push(`Theme: ${inputs.themePrompt}.`);
  if (inputs.baseInstructions) parts.push(`Base: ${inputs.baseInstructions}.`);
  parts.push(RELATIONSHIP_SHORT[inputs.relationship]);
  if (inputs.complexityLevel <= 2) parts.push('Simple, clean, minimal detail.');
  else if (inputs.complexityLevel >= 4) parts.push('Highly detailed and intricate.');
  if (inputs.contrast === 'high') parts.push('Maximum contrast.');

  return parts.join(' ');
}

export const SAMPLE_PROMPTS = {
  matching: {
    title: 'Matching Coil + Base Concept',
    coil: 'B&W laser-etch design for coil sleeve: Sacred geometry mandala wrap with flower of life pattern and geometric borders. Must match base exactly.',
    base: 'B&W laser-etch design for circular base: Flower of life medallion with matching border pattern from coil. Centered radial symmetry.',
  },
  mirrored: {
    title: 'Mirrored Coil + Base Concept',
    coil: 'B&W coil: Yin-yang curves — organic lines on left, geometric on right. Wraps seamlessly.',
    base: 'B&W circular base: Inverse of coil — geometric where coil has organic, organic where coil has geometric.',
  },
  loose: {
    title: 'Loosely Coordinated Coil + Base',
    coil: 'B&W coil: Abstract smoke wisps flowing horizontally. Minimal, clean, thick lines.',
    base: 'B&W circular base: Single smoke vortex from above. Same line style as coil.',
  },
  bw_laser: {
    title: 'Black & White Laser-Ready',
    prompt: 'Production-ready B&W for laser etching. Clean geometric hexagonal grid with 3D depth illusion using line thickness variation only.',
  },
  manufacturing_safe: {
    title: 'Manufacturing-Safe Revision',
    prompt: 'Simplify for laser manufacturing: thicker lines (0.3mm min), wider gaps (0.4mm min), no fine details under 0.5mm, no gradients.',
  },
};
