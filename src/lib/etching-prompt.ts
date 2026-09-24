import { ENGRAVING_RULES } from './prompt-builder';

/**
 * Canonical production-prompt builder for Bong Design Studio 2.0.
 *
 * ONE place composes the full hidden generation prompt. The application owns the
 * mandatory engraving rules — employees never type "black and white" or "make it
 * laser engravable"; they describe the design and pick Simple/Balanced/Intricate.
 *
 * Everything technical (aspect ratio, wrap physics, coverage, coordinated-set
 * direction, engraving constraints) is translated here from plain choices.
 */

export type DetailLevel = 'simple' | 'balanced' | 'intricate';
export type EtchCoverage = 'light' | 'medium' | 'heavy';
export type ArtShape = 'standard' | 'wide' | 'tall' | 'extra_wide' | 'wrap' | 'custom';

export interface DesignFamilyContext {
  theme: string;
  visualStyle: string;
  lineStyle: string;
  density: string;
  sharedElements: string[];
}

export interface EtchingPromptInput {
  /** The employee's design idea (already brainstorm-refined). */
  concept: string;
  /** Which area this is for — 'Coil', 'Base', etc. Used for framing language. */
  targetName?: string;
  /** Physical size, for scale-aware detail hints. */
  dimensions?: { width?: number; height?: number; units?: string };
  aspectRatio?: number;
  detailLevel?: DetailLevel;
  etchCoverage?: EtchCoverage;
  shape?: ArtShape;
  wrap?: boolean;
  seamless?: boolean;
  /** When this design is part of a coordinated set, the shared creative brief. */
  designFamilyContext?: DesignFamilyContext;
}

function detailClause(level: DetailLevel): string {
  switch (level) {
    case 'simple':
      return 'SIMPLE detail: a few large, instantly recognizable shapes; thick bold outlines; generous empty white space; no tiny elements or fine texture.';
    case 'intricate':
      return 'INTRICATE detail: rich linework with secondary and background elements; more etched areas; still every line cleanly separated so it resolves when etched — no muddy cross-hatching.';
    default:
      return 'BALANCED detail: a strong central subject with moderate supporting detail; good balance of black and white; nothing so fine it blurs.';
  }
}

function coverageClause(coverage: EtchCoverage): string {
  switch (coverage) {
    case 'light':
      return 'Light etch coverage: mostly white/negative space with the subject in bold black — roughly 15–30% black.';
    case 'heavy':
      return 'Heavy etch coverage: bold, dense black areas dominating the composition — roughly 50–70% black — while keeping crisp white separation.';
    default:
      return 'Medium etch coverage: a comfortable balance of black and white — roughly 30–50% black.';
  }
}

function shapeClause(shape: ArtShape, aspectRatio?: number, wrap?: boolean, seamless?: boolean): string {
  if (wrap || shape === 'wrap') {
    const seam = seamless
      ? ' The far LEFT and far RIGHT edges must connect seamlessly — the pattern continues without a visible seam when the two ends meet.'
      : '';
    return (
      'WRAP-AROUND artwork for a cylindrical glass surface: a very WIDE horizontal composition, evenly balanced from left to right with no single dominant center. ' +
      'Do not place an important object where it would be awkwardly cut at the left or right edge — the art flows continuously around the cylinder.' +
      seam
    );
  }
  switch (shape) {
    case 'wide':
      return 'WIDE horizontal composition — noticeably wider than tall — filling the canvas edge to edge with no side padding.';
    case 'extra_wide':
      return 'EXTRA-WIDE panoramic composition — several times wider than tall — a horizontal band that fills the whole width, no side padding.';
    case 'tall':
      return 'TALL vertical composition — taller than wide — filling the canvas top to bottom with no top/bottom padding.';
    default: {
      const ar = aspectRatio || 1;
      if (ar >= 1.25) return 'Wide horizontal composition filling the canvas edge to edge.';
      if (ar <= 0.8) return 'Tall vertical composition filling the canvas top to bottom.';
      return 'Square, centered composition that fills the canvas evenly.';
    }
  }
}

function familyClause(ctx: DesignFamilyContext, targetName?: string): string {
  const shared = ctx.sharedElements?.length ? ` Shared visual elements to carry through: ${ctx.sharedElements.join(', ')}.` : '';
  return (
    `COORDINATED SET — this is the "${targetName || 'piece'}" of a matching family. ` +
    `Theme: ${ctx.theme}. Visual style: ${ctx.visualStyle}. Line style: ${ctx.lineStyle}. Density: ${ctx.density}.` +
    shared +
    ' Keep the same illustration style, line weight and visual density as its siblings, but with its own distinct subject — coordinated, not identical.'
  );
}

/**
 * Build the full production prompt. Mandatory engraving rules are always first
 * and last so they dominate; the employee's concept sits in the middle with the
 * translated technical direction.
 */
export function buildEtchingPrompt(input: EtchingPromptInput): string {
  const {
    concept, targetName, dimensions, aspectRatio,
    detailLevel = 'balanced', etchCoverage = 'medium', shape = 'standard',
    wrap = false, seamless = false, designFamilyContext,
  } = input;

  const parts: string[] = [];
  parts.push(ENGRAVING_RULES.forGeneration);
  if (designFamilyContext) parts.push(familyClause(designFamilyContext, targetName));
  parts.push(`DESIGN: ${concept.trim()}.`);
  if (targetName) parts.push(`This artwork is the ${targetName} of a glass piece.`);
  parts.push(shapeClause(shape, aspectRatio, wrap, seamless));
  parts.push(detailClause(detailLevel));
  parts.push(coverageClause(etchCoverage));
  if (dimensions?.width && dimensions?.height) {
    parts.push(`Intended physical etch size ~${dimensions.width}×${dimensions.height} ${dimensions.units || 'in'} — keep details large enough to resolve at that scale.`);
  }
  // Final, strongest reminder — last instruction weighs heaviest for image models.
  parts.push('FINAL: pure black on pure white, no color, no gray, no gradients, no shading. Binary black-and-white line art suitable for laser etching.');
  return parts.join(' ');
}

/**
 * Build the shared creative brief for a coordinated set from the top-level
 * concept + detail choice. Kept deterministic (no AI) so it always produces a
 * consistent family direction the per-target prompts can share.
 */
export function buildDesignFamilyContext(concept: string, detailLevel: DetailLevel = 'balanced'): DesignFamilyContext {
  const density = detailLevel === 'simple' ? 'minimal, bold' : detailLevel === 'intricate' ? 'rich, detailed' : 'balanced';
  return {
    theme: concept.trim(),
    visualStyle: 'cohesive hand-drawn engraving illustration',
    lineStyle: 'bold, confident black engraved linework of consistent weight',
    density,
    sharedElements: [],
  };
}
