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

/**
 * Where clicking the check label should take the user. The ReadinessChecklist
 * component uses these to wire clickable hot-links so a designer can jump
 * straight from a failing check to the right surface.
 *
 *  - tab="<section>" → switch the concept-detail tab
 *  - tab="external:/some/path" → navigate to another route (mockup studio etc)
 *
 * `intent` is forwarded as a query param the destination can read so it
 * pre-loads the right concept (e.g. mockup studio opens with this
 * concept's coil already selected).
 */
export interface ReadinessAction {
  tab?: 'overview' | 'specs' | 'versions' | 'comments' | 'ai' | 'manufacturing' | 'audit';
  externalHref?: string;
  intent?: string;
}

export interface ReadinessCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
  /** Category label used for grouping in the UI */
  group: 'design' | 'specs' | 'marketing' | 'review';
  /** Where clicking this row should send the user, if anywhere */
  action?: ReadinessAction;
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
      ? { id: 'coil', label: 'Coil design image', status: 'pass', detail: 'Saved and ready.', group: 'design',
          action: { tab: 'overview' } }
      : { id: 'coil', label: 'Coil design image', status: 'fail', detail: 'No coil image yet — generate one from the concept page.', group: 'design',
          action: { tab: 'overview' } }
  );

  if (!concept.coilOnly) {
    checks.push(
      concept.baseImageUrl
        ? { id: 'base', label: 'Base design image', status: 'pass', detail: 'Saved and ready.', group: 'design',
            action: { tab: 'overview' } }
        : { id: 'base', label: 'Base design image', status: 'fail', detail: 'No base image yet — generate one, or mark this concept as coil-only.', group: 'design',
            action: { tab: 'overview' } }
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
    action: { tab: 'specs' },
  });

  // Manufacturing notes — accept notes from EITHER the canonical
  // concept.manufacturingNotes field OR the manufacturing-record's
  // notes column (which the Manufacturing tab persists). Previously
  // this check only inspected concept.manufacturingNotes, so notes
  // entered through the Manufacturing tab UI never ticked the box.
  const mfgNotesRaw = (concept.manufacturingNotes || '').trim()
    || ((concept as unknown as { manufacturing?: { notes?: string } }).manufacturing?.notes || '').trim();
  checks.push({
    id: 'mfg_notes',
    label: 'Manufacturing notes',
    status: mfgNotesRaw ? 'pass' : 'warn',
    detail: mfgNotesRaw
      ? 'Notes recorded for the etch team.'
      : 'No manufacturing notes yet — add them on the Manufacturing tab.',
    group: 'specs',
    action: { tab: 'manufacturing' },
  });

  // ---- MARKETING ----
  // The mockup hot-link goes to the standalone Mockup Studio with the
  // current concept pre-selected so the designer doesn't have to find
  // it again.
  checks.push({
    id: 'mockup',
    label: 'Product mockup',
    status: concept.productMockupUrl ? 'pass' : 'warn',
    detail: concept.productMockupUrl
      ? 'AI mockup of the etched product exists.'
      : 'No mockup yet — render one from the Mockup tab.',
    group: 'marketing',
    action: { externalHref: '/?tab=mockup', intent: `concept=${concept.id}` },
  });

  checks.push({
    id: 'marketing_graphic',
    label: 'Marketing graphic',
    status: concept.marketingGraphicUrl ? 'pass' : 'warn',
    detail: concept.marketingGraphicUrl
      ? 'Ready-to-post marketing image composited.'
      : 'No marketing graphic yet — compose one from the Marketing tab.',
    group: 'marketing',
    action: { externalHref: '/?tab=marketing', intent: `concept=${concept.id}` },
  });

  checks.push({
    id: 'marketing_story',
    label: 'Marketing story',
    status: concept.marketingStory?.trim() ? 'pass' : 'warn',
    detail: concept.marketingStory?.trim()
      ? 'Story written — ready for Shopify.'
      : 'No marketing story — generate one with AI.',
    group: 'marketing',
    action: { tab: 'overview' },
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
    action: { tab: 'overview' },
  });

  const passCount = checks.filter((c) => c.status === 'pass').length;
  const warnCount = checks.filter((c) => c.status === 'warn').length;
  const failCount = checks.filter((c) => c.status === 'fail').length;
  const totalCount = checks.length;
  const percent = Math.round((passCount / totalCount) * 100);
  const ready = failCount === 0 && percent >= 70;

  return { checks, passCount, warnCount, failCount, totalCount, percent, ready };
}
