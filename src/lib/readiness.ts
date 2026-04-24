import { Concept } from './types';

/**
 * Production-readiness scoring. Synthesizes every piece of work we track on
 * a concept into a single "is this ready to ship?" signal.
 *
 * Philosophy:
 *  - Some checks are hard requirements (`fail`) — you genuinely can't ship
 *    without them (e.g. no coil image).
 *  - Others are soft signals (`warn`) — missing but not blocking (e.g. no
 *    marketing graphic yet).
 *  - Coil-only concepts skip base-related checks automatically.
 *
 * Used by:
 *  - ReadinessChecklist component on concept detail
 *  - Dashboard aggregate "ship-ready" count
 *  - Workflow board could light up cards that pass all checks (future)
 */

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  /** Category label used for grouping in the UI */
  group: 'design' | 'specs' | 'marketing' | 'review';
}

export interface ReadinessReport {
  checks: ReadinessCheck[];
  passCount: number;
  warnCount: number;
  failCount: number;
  totalCount: number;
  /** 0-100% based on pass / total */
  percent: number;
  /** True when no fails AND percent >= 70 */
  ready: boolean;
}

export function computeReadiness(concept: Concept): ReadinessReport {
  const checks: ReadinessCheck[] = [];

  // ---- DESIGN ----
  checks.push(
    concept.coilImageUrl
      ? { id: 'coil', label: 'Coil design image', status: 'pass', detail: 'Saved and ready.', group: 'design' }
      : { id: 'coil', label: 'Coil design image', status: 'fail', detail: 'No coil image yet — generate one from the concept page.', group: 'design' }
  );

  if (!concept.coilOnly) {
    checks.push(
      concept.baseImageUrl
        ? { id: 'base', label: 'Base design image', status: 'pass', detail: 'Saved and ready.', group: 'design' }
        : { id: 'base', label: 'Base design image', status: 'fail', detail: 'No base image yet — generate one, or mark this concept as coil-only.', group: 'design' }
    );
  }

  // ---- SPECS ----
  const hasCoilDims = !!concept.coilSpecs?.dimensions?.trim();
  const hasBaseDims = !!concept.baseSpecs?.dimensions?.trim();
  const dimsOk = concept.coilOnly ? hasCoilDims : (hasCoilDims && hasBaseDims);
  checks.push({
    id: 'dimensions',
    label: 'Manufacturing dimensions',
    status: dimsOk ? 'pass' : 'warn',
    detail: dimsOk
      ? 'Dimensions recorded for all parts.'
      : 'Dimensions not fully specified — set them in the Specs tab.',
    group: 'specs',
  });

  checks.push({
    id: 'mfg_notes',
    label: 'Manufacturing notes',
    status: concept.manufacturingNotes?.trim() ? 'pass' : 'warn',
    detail: concept.manufacturingNotes?.trim()
      ? 'Notes recorded for the etch team.'
      : 'No manufacturing notes yet.',
    group: 'specs',
  });

  // ---- MARKETING ----
  checks.push({
    id: 'mockup',
    label: 'Product mockup',
    status: concept.productMockupUrl ? 'pass' : 'warn',
    detail: concept.productMockupUrl
      ? 'AI mockup of the etched product exists.'
      : 'No mockup yet — render one from the Mockup tab.',
    group: 'marketing',
  });

  checks.push({
    id: 'marketing_graphic',
    label: 'Marketing graphic',
    status: concept.marketingGraphicUrl ? 'pass' : 'warn',
    detail: concept.marketingGraphicUrl
      ? 'Ready-to-post marketing image composited.'
      : 'No marketing graphic yet — compose one from the Marketing tab.',
    group: 'marketing',
  });

  checks.push({
    id: 'marketing_story',
    label: 'Marketing story',
    status: concept.marketingStory?.trim() ? 'pass' : 'warn',
    detail: concept.marketingStory?.trim()
      ? 'Story written — ready for Shopify.'
      : 'No marketing story — generate one with AI.',
    group: 'marketing',
  });

  // ---- REVIEW ----
  checks.push({
    id: 'review',
    label: 'Design reviewer check',
    status: concept.personaReviews ? 'pass' : 'warn',
    detail: concept.personaReviews
      ? `Reviewed — Fan ${concept.personaReviews.fan?.score ?? '?'}/10, Taste-Maker ${concept.personaReviews.skeptic?.score ?? '?'}/10.`
      : 'Not yet reviewed by AI personas.',
    group: 'review',
  });

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const totalCount = checks.length;
  const percent = Math.round((passCount / totalCount) * 100);
  const ready = failCount === 0 && percent >= 70;

  return { checks, passCount, warnCount, failCount, totalCount, percent, ready };
}
