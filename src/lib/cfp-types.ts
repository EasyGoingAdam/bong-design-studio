/**
 * Type shapes mirroring the external Customize Freeze Pipe (CFP) API:
 *   https://customize-freezepipe-production.up.railway.app/api/external
 *
 * These are kept lean — only fields we actually consume in the UI are
 * declared. Add to them as the surface grows.
 */

export type CfpStatus =
  | 'new'
  | 'in_progress'
  | 'ready'
  | 'etched'
  | 'shipped'
  | 'rejected'
  | 'duplicate'
  | 'archived';

export type CfpSource = 'site' | 'shopify_iframe' | 'shopify_iframe_test';

export type CfpGlycerinColor = 'Clear' | 'Red' | 'Blue' | 'Purple' | 'Green' | 'Pink';

export interface CfpVersion {
  id: string;
  versionNumber: number;
  modelUsed: string;
  createdAt: string;
  promptUsed?: string;
  downloadUrls: {
    png?: string;
    jpeg?: string;
    svg?: string;
  };
}

export interface CfpDesign {
  id: string;
  customerEmail: string;
  customerName: string;
  orderNumber: string | null;
  glycerinColor: CfpGlycerinColor | null;
  textRequested: string | null;
  theme: string | null;
  style: string | null;
  status: CfpStatus;
  source: CfpSource;
  widthMm: number | null;
  heightMm: number | null;
  createdAt: string;
  submittedAt: string | null;
  lastEditedAt: string | null;
  selectedVersion: CfpVersion | null;
  allVersions: CfpVersion[];
  // /designs/{id} returns these too
  userPrompt?: string;
  finalPromptSentToOpenai?: string;
  complexity?: string;
  fontStyle?: string;
}

export interface CfpListResponse {
  designs: CfpDesign[];
  nextCursor: string | null;
  count: number;
  hasMore: boolean;
}

export interface CfpStats {
  window: { sinceIso: string; untilIso: string; days: number };
  totals: { designs: number; submitted: number; drafts: number; uniqueEmails: number; uniqueOrders: number };
  byStatus: Record<string, number>;
  byGlycerinColor: Record<string, number>;
  bySource: Record<string, number>;
  byDay: { day: string; designs: number; submitted: number }[];
  topThemes: { theme: string; count: number }[];
}

export const CFP_STATUS_META: Record<CfpStatus, { label: string; cls: string }> = {
  new:         { label: 'New',         cls: 'st-ideation' },
  in_progress: { label: 'In progress', cls: 'st-review' },
  ready:       { label: 'Ready',       cls: 'st-approved' },
  etched:      { label: 'Etched',      cls: 'st-ready' },
  shipped:     { label: 'Shipped',     cls: 'st-mfg' },
  rejected:    { label: 'Rejected',    cls: 'bg-red-100 text-red-700' },
  duplicate:   { label: 'Duplicate',   cls: 'st-archived' },
  archived:    { label: 'Archived',    cls: 'st-archived' },
};

export const CFP_GLYCERIN_HEX: Record<CfpGlycerinColor, string> = {
  // Clear glycerin renders as a soft glass-like swatch — falls back to
  // the closest solid color we can express in a CSS hex if the consumer
  // can't render a gradient. Components that DO support gradients should
  // detect Clear and use the radial style from the consumer side.
  Clear:  '#e6ecf1',
  Red:    '#c0392b',
  Blue:   '#2e6da4',
  Purple: '#7d4ca0',
  Green:  '#3a7d44',
  Pink:   '#d96a8a',
};

/**
 * Forward statuses to make state changes obvious in the UI. Pulling these
 * out of the metadata so the order is intentional.
 */
export const CFP_STATUS_FORWARD: CfpStatus[] = [
  'new', 'in_progress', 'ready', 'etched', 'shipped',
];
export const CFP_STATUS_TERMINAL: CfpStatus[] = [
  'rejected', 'duplicate', 'archived',
];
