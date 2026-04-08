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
}

const BW_BASE = 'Use only pure black lines and fills on a white background. No color, no gradients, no gray tones, no shading, no halftones.';

const MODE_PREFIXES: Record<GenerationMode, string> = {
  concept_art: `Create a detailed black and white concept illustration for laser etching on glass. ${BW_BASE} This is an exploratory concept — creative freedom is encouraged but keep it black and white`,
  production_bw: `Create a high-contrast black and white design optimized for laser etching on glass. ${BW_BASE} Prioritize clean lines, manufacturing reliability, and production feasibility`,
  pattern_wrap: `Create a seamless repeating black and white pattern design that wraps around a cylindrical surface. ${BW_BASE}`,
  premium_luxury: `Create an ornate, luxurious black and white design with fine filigree detail, baroque-inspired scrollwork, and premium aesthetic. ${BW_BASE}`,
  seasonal_drop: `Create a bold, eye-catching black and white seasonal/holiday themed design for laser etching. ${BW_BASE}`,
};

const RELATIONSHIP_INSTRUCTIONS: Record<CoilBaseRelationship, string> = {
  exact_match: 'The coil and base designs must be perfectly coordinated — same visual language, matching elements, unified composition when viewed together.',
  mirror: 'The coil and base designs should mirror each other — one is the reflection/inverse of the other while maintaining the same style.',
  thematic: 'The coil and base should share the same theme and style family but can have distinct compositions that feel like they belong to the same set.',
  loose: 'The coil and base should have a loose visual connection — complementary mood and aesthetic but each can stand on its own.',
  complementary: 'The coil and base designs should complement each other — where one is detailed the other is minimal, creating visual balance when paired.',
  contrast: 'The coil and base designs should deliberately contrast — different visual weights, densities, or motifs that create dynamic tension while sharing one unifying element.',
  continuation: 'The base design should be a visual continuation of the coil — as if the artwork flows from the coil down onto the base, creating one connected composition across both pieces.',
  independent: 'The coil and base are designed completely independently — each is a standalone artwork with its own identity, no coordination required.',
};

const LASER_CONSTRAINTS = `
CRITICAL LASER ETCHING CONSTRAINTS:
- Output must be pure black lines/fills on white background
- NO gradients, NO gray values, NO halftones
- Minimum line thickness: 0.25mm
- Minimum gap between lines: 0.3mm
- Avoid areas of solid black larger than 5mm²
- All details must be visible at actual print size
- Design must work as a vector-ready illustration
`;

export function buildCoilPrompt(inputs: PromptInputs): string {
  const parts: string[] = [];

  parts.push(MODE_PREFIXES[inputs.mode]);
  parts.push(`for the COIL piece (cylindrical sleeve, 45mm tall x 120mm wrap circumference) of a glass product.`);

  if (inputs.title) parts.push(`Design concept: "${inputs.title}".`);
  if (inputs.stylePrompt) parts.push(`Style: ${inputs.stylePrompt}.`);
  if (inputs.themePrompt) parts.push(`Theme: ${inputs.themePrompt}.`);
  if (inputs.coilInstructions) parts.push(`Specific coil instructions: ${inputs.coilInstructions}.`);

  parts.push(RELATIONSHIP_INSTRUCTIONS[inputs.relationship]);

  if (inputs.complexityLevel <= 2) {
    parts.push('Keep the design simple and clean with minimal detail. Production-friendly.');
  } else if (inputs.complexityLevel >= 4) {
    parts.push('The design can be highly detailed and intricate.');
  }

  if (inputs.contrast === 'high') {
    parts.push('Use maximum contrast between black and white areas.');
  }

  parts.push(LASER_CONSTRAINTS);

  if (inputs.references) parts.push(`Inspiration/references: ${inputs.references}.`);
  if (inputs.constraints) parts.push(`Additional constraints: ${inputs.constraints}.`);

  parts.push('The design should wrap seamlessly around a cylinder. Output as a flat rectangular design ready to wrap.');

  return parts.join('\n\n');
}

export function buildBasePrompt(inputs: PromptInputs): string {
  const parts: string[] = [];

  parts.push(MODE_PREFIXES[inputs.mode]);
  parts.push(`for the BASE piece (circular top-down view, 65mm diameter) of a glass product.`);

  if (inputs.title) parts.push(`Design concept: "${inputs.title}".`);
  if (inputs.stylePrompt) parts.push(`Style: ${inputs.stylePrompt}.`);
  if (inputs.themePrompt) parts.push(`Theme: ${inputs.themePrompt}.`);
  if (inputs.baseInstructions) parts.push(`Specific base instructions: ${inputs.baseInstructions}.`);

  parts.push(RELATIONSHIP_INSTRUCTIONS[inputs.relationship]);

  if (inputs.complexityLevel <= 2) {
    parts.push('Keep the design simple and clean with minimal detail. Production-friendly.');
  } else if (inputs.complexityLevel >= 4) {
    parts.push('The design can be highly detailed and intricate.');
  }

  if (inputs.contrast === 'high') {
    parts.push('Use maximum contrast between black and white areas.');
  }

  parts.push(LASER_CONSTRAINTS);

  if (inputs.references) parts.push(`Inspiration/references: ${inputs.references}.`);
  if (inputs.constraints) parts.push(`Additional constraints: ${inputs.constraints}.`);

  parts.push('The design should be circular and viewed from directly above. Center the main element.');

  return parts.join('\n\n');
}

export function buildRefinementPrompt(
  action: string,
  originalPrompt: string
): string {
  const refinements: Record<string, string> = {
    'generate_more': `Create a new variation of this design concept, keeping the same theme and style but with different compositional choices:\n\n${originalPrompt}`,
    'refine': `Refine and improve this design concept while keeping the core theme intact. Make it more polished and production-ready:\n\n${originalPrompt}`,
    'simplify_laser': `Simplify this design for laser etching production. Reduce detail, increase line thickness to minimum 0.3mm, remove any gradients, ensure all elements will etch cleanly on glass:\n\n${originalPrompt}`,
    'coordinate_more': `Make the coil and base designs more visually coordinated. They should clearly look like matching pieces of the same set:\n\n${originalPrompt}`,
    'complement_base': `Adjust the base design to better complement and complete the coil design. The base should feel like the natural pair:\n\n${originalPrompt}`,
    'higher_contrast': `Increase the contrast of this design. Make blacks blacker, whites whiter, remove any mid-tones. Pure high-contrast black and white:\n\n${originalPrompt}`,
    'reduce_detail': `Reduce the detail level of this design for easier manufacturing. Simplify complex areas, merge fine lines, increase spacing between elements:\n\n${originalPrompt}`,
  };

  return refinements[action] || originalPrompt;
}

// Sample prompts for reference
export const SAMPLE_PROMPTS = {
  matching: {
    title: 'Matching Coil + Base Concept',
    coil: `Create a high-contrast black and white design optimized for laser etching on glass. Use only pure black lines on white background, no gradients.

For the COIL piece (cylindrical sleeve, 45mm tall x 120mm wrap circumference):
Sacred geometry mandala pattern that wraps seamlessly around the cylinder. Interlocking circles forming flower of life pattern with clean geometric borders top and bottom.

The coil and base designs must be perfectly coordinated — same visual language, matching elements, unified composition.

Minimum line thickness: 0.3mm. The design should wrap seamlessly around a cylinder.`,
    base: `Create a high-contrast black and white design optimized for laser etching on glass.

For the BASE piece (circular, 65mm diameter, top-down view):
Sacred geometry flower of life as the center medallion, surrounded by the same interlocking circle border pattern used on the coil. Perfectly centered radial symmetry.

Must match the coil design exactly in style, line weight, and visual language.`,
  },
  mirrored: {
    title: 'Mirrored Coil + Base Concept',
    coil: `Black and white laser-etch design for cylindrical COIL (45mm x 120mm wrap):
Yin-yang inspired flowing curves with dot patterns. Left half features organic flowing lines, right half features geometric angular lines. When wrapped, the two halves meet at the seam.

The base should be the mirror/inverse of this — where the coil has organic, the base has geometric, and vice versa.`,
    base: `Black and white laser-etch design for circular BASE (65mm diameter, top-down):
The inverse/mirror of the coil design. Center divided into organic and geometric halves, but REVERSED from the coil — where the coil has flowing curves, the base has angular geometry. Same line weights and density. Viewed from above.`,
  },
  loose: {
    title: 'Loosely Coordinated Coil + Base',
    coil: `Black and white design for laser etching on cylindrical glass COIL (45mm x 120mm):
Abstract smoke wisps flowing horizontally around the cylinder. Loose, organic, flowing lines that suggest smoke or vapor. Minimal, clean, lots of white space. Production-friendly with thick lines.

The base will have a complementary but different composition in the same visual mood.`,
    base: `Black and white design for laser etching on circular glass BASE (65mm diameter, top-down):
A single abstract smoke ring or vortex viewed from above, centered. Same line style and weight as the coil's horizontal smoke wisps but seen from a bird's eye perspective. Minimal and clean.`,
  },
  bw_laser: {
    title: 'Black & White Laser-Ready',
    prompt: `Create a production-ready black and white design for laser etching on glass.

STRICT REQUIREMENTS:
- Pure black lines on white background ONLY
- No gradients, no gray, no halftones, no shading
- Minimum line thickness: 0.3mm
- Minimum gap between lines: 0.3mm
- No solid fill areas larger than 5mm²
- All details visible at actual size
- Vector-clean edges

Style: Clean geometric hexagonal grid with depth illusion. Lines create a 3D honeycomb effect using only line thickness variation. Seamless wrap for cylinder.`,
  },
  manufacturing_safe: {
    title: 'Manufacturing-Safe Revision',
    prompt: `REVISION REQUEST: Simplify the attached design for reliable laser manufacturing.

Changes needed:
1. Increase all line thicknesses to minimum 0.3mm
2. Increase gaps between parallel lines to minimum 0.4mm
3. Remove any detail smaller than 0.5mm
4. Merge closely-spaced fine lines into single thicker lines
5. Eliminate any gradient or halftone areas
6. Ensure no solid black area exceeds 5mm²
7. Simplify any overly complex intersections
8. Maintain the overall visual impact while reducing etching time

The result should etch cleanly at 300mm/s on borosilicate glass with no detail loss.`,
  },
};
