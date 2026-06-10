import { Concept } from './types';

/**
 * Display helpers that make every surface stamps-aware.
 *
 * Stamps concepts store their art in concept.stamps[] and have EMPTY
 * coilImageUrl/baseImageUrl — so any thumbnail/counter that only checks
 * the coil/base fields renders blank for them. Route all "what image do
 * I show for this concept" logic through here.
 */

/** First displayable image for a concept — coil, then base, then the
 *  first stamp with an image. Empty string when nothing exists. */
export function conceptPrimaryImage(c: Concept): string {
  if (c.coilImageUrl) return c.coilImageUrl;
  if (c.baseImageUrl) return c.baseImageUrl;
  return (c.stamps || []).find((s) => s.imageUrl)?.imageUrl || '';
}

/** True when the concept has ANY artwork — coil/base or stamps. */
export function conceptHasImages(c: Concept): boolean {
  if (c.coilImageUrl || c.baseImageUrl) return true;
  return (c.stamps || []).some((s) => s.imageUrl);
}

/**
 * Derive the stamps "theme" from a concept: first non-meta tag, else the
 * concept name with the word "stamps" stripped. Shared by the AI Generate
 * page, QuickGenerateModal and StampsPanel so they can't drift apart.
 */
export function getStampTheme(c: Concept): string {
  const fromTag = (c.tags || []).find((t) => {
    const lower = t.toLowerCase();
    return lower !== 'stamps' && lower !== 'auto-saved' && !/^\d-pack$/.test(lower);
  });
  const fromName = c.name.replace(/\bstamps?\b/gi, '').trim();
  return (fromTag || fromName || c.name).trim();
}
