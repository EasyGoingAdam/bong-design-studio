export type ConceptStatus =
  | 'ideation'
  | 'in_review'
  | 'approved'
  | 'ready_for_manufacturing'
  | 'manufactured'
  | 'archived';

export type LifecycleType = 'seasonal' | 'evergreen' | 'limited_edition' | 'custom';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';
export type CoilBaseRelationship = 'exact_match' | 'mirror' | 'thematic' | 'loose' | 'complementary' | 'contrast' | 'continuation' | 'independent';
export type GenerationMode =
  | 'concept_art'
  | 'production_bw'
  | 'pattern_wrap'
  | 'premium_luxury'
  | 'seasonal_drop';

export interface ConceptSpecs {
  designStyleName: string;
  designTheme: string;
  patternDensity: 'low' | 'medium' | 'high' | 'very_high';
  laserComplexity: 1 | 2 | 3 | 4 | 5;
  estimatedEtchingTime: string;
  surfaceCoverage: number;
  lineThickness: string;
  bwContrastGuidance: string;
  symmetryRequirement: 'none' | 'symmetrical' | 'wraparound' | 'partial';
  coordinationMode: CoilBaseRelationship;
  productionFeasibility: 1 | 2 | 3 | 4 | 5;
  riskNotes: string;
  baseShape?: 'circle' | 'oval' | 'square' | 'rectangle';
}

export interface CoilSpecs {
  dimensions: string;
  printableArea: string;
  notes: string;
}

export interface BaseSpecs {
  dimensions: string;
  printableArea: string;
  notes: string;
}

export interface Comment {
  id: string;
  conceptId: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: string;
}

export interface ApprovalLog {
  id: string;
  conceptId: string;
  userId: string;
  userName: string;
  action: 'approved' | 'needs_revision' | 'moved_stage';
  fromStage?: ConceptStatus;
  toStage?: ConceptStatus;
  notes: string;
  createdAt: string;
}

export interface ManufacturingRecord {
  conceptId: string;
  machineReadyNotes: string;
  targetMaterial: string;
  etchingSettings: string;
  estimatedProductionTime: string;
  batchName: string;
  dateSentToProduction: string;
  dateManufactured: string;
  quantityProduced: number;
  qcNotes: string;
}

export interface AIGenerationRecord {
  id: string;
  conceptId: string;
  prompt: string;
  coilPrompt: string;
  basePrompt: string;
  mode: GenerationMode;
  coilImageUrl: string;
  baseImageUrl: string;
  combinedImageUrl: string;
  createdAt: string;
  variationOf?: string;
  /** Identifier for the model that produced this generation, for
   *  A/B comparison and archive metadata. e.g. 'gpt-image-1',
   *  'gpt-image-2', 'gemini-2.5-flash-image'. Optional because older
   *  records predate the field. */
  model?: string;
  /** High-level provider label — 'openai' | 'openai_v2' | 'gemini' */
  provider?: string;
}

export interface ConceptVersion {
  id: string;
  conceptId: string;
  versionNumber: number;
  coilImageUrl: string;
  baseImageUrl: string;
  combinedImageUrl: string;
  prompt?: string;
  notes: string;
  createdAt: string;
}

export interface PersonaReview {
  score: number;
  comment: string;
  recommendations?: string[];
  similarTo?: string;
  error?: string;
}

export interface PersonaReviewsCache {
  fan: PersonaReview;
  skeptic: PersonaReview;
  fingerprint: string;
  reviewedAt: string;
  manufacturedCount?: number;
}

export interface Concept {
  id: string;
  name: string;
  collection: string;
  status: ConceptStatus;
  createdAt: string;
  updatedAt: string;
  designer: string;
  tags: string[];
  description: string;
  intendedAudience: string;
  manufacturingNotes: string;
  marketingStory: string;
  personaReviews?: PersonaReviewsCache;
  archivedAt?: string;
  coilImageUrl: string;
  baseImageUrl: string;
  combinedImageUrl: string;
  /** Photo of the finished, laser-etched product (uploaded by the team) */
  productPhotoUrl: string;
  /** Composited marketing graphic: product photo + name + coil-design overlay */
  marketingGraphicUrl: string;
  /** Optional AI-suggested tagline to overlay on the marketing graphic */
  marketingTagline: string;
  /** Photo of the blank (un-etched) product — used as the base for AI mockups */
  blankProductUrl: string;
  /** Primary AI-rendered mockup showing the design etched onto the product */
  productMockupUrl: string;
  /** Additional mockup angles as JSON array [{angle, url}] */
  productMockupAngles: { angle: string; url: string }[];
  /** True when this concept is a coil-only design (no base piece).
   *  Hides base UI throughout the app and skips base generation. */
  coilOnly: boolean;
  /** Attribution for externally-submitted concepts (via /api/incoming/concept).
   *  `source` identifies the originating tool (e.g. 'custom-designer-v1');
   *  `externalId` is that tool's primary key for this design; `externalUrl`
   *  is a deep-link back to the tool's view of the design. Submitter fields
   *  capture the end-customer on the other side. Empty strings for
   *  team-created concepts. */
  source: string;
  externalId: string;
  externalUrl: string;
  submitterEmail: string;
  submitterName: string;
  specs: ConceptSpecs;
  coilSpecs: CoilSpecs;
  baseSpecs: BaseSpecs;
  priority: PriorityLevel;
  /** "Star / highlight" flag — independent of priority. Lets a production
   *  lead flag specific concepts as "design this soonest" without
   *  touching the priority semantic. Toggleable from the workflow card. */
  highlighted: boolean;
  /** Design format. Default 'standard' = one big coil + optional base.
   *  'stamps' = a small set of independent mini-graphics related to a
   *  shared theme (e.g. "baseball" → baseball, bat, player, glove, cap).
   *  When 'stamps', `stamps[]` carries the imagery and coil/base are
   *  typically empty. Existing concepts default to 'standard'. */
  designType: 'standard' | 'stamps';
  /** Stamp images for stamps-mode concepts. Each stamp is an
   *  independent engraving-ready graphic the team can edit or
   *  regenerate individually. Empty array for standard concepts. */
  stamps: Stamp[];
  lifecycleType: LifecycleType;
  versions: ConceptVersion[];
  comments: Comment[];
  approvalLogs: ApprovalLog[];
  manufacturingRecord?: ManufacturingRecord;
  aiGenerations: AIGenerationRecord[];
}

export interface SpecTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  specs: Partial<ConceptSpecs>;
  coilSpecs: Partial<CoilSpecs>;
  baseSpecs: Partial<BaseSpecs>;
}

/**
 * One stamp = one independent engraving-ready mini graphic. A stamps-mode
 * Concept has 1-5 of these; each can be edited or regenerated on its own.
 * `id` is stable across regenerations so the UI can hold its place when
 * one stamp is swapped out.
 */
export interface Stamp {
  id: string;
  subject: string;     // e.g. "baseball bat" — what the stamp depicts
  imageUrl: string;
  prompt: string;      // the engraving prompt that produced this image
  createdAt: string;
  /** Identifier of the model that produced this stamp (gpt-image-1 etc.) */
  model?: string;
}

export interface User {
  id: string;
  name: string;
  role: 'admin' | 'designer' | 'reviewer';
  avatar: string;
}

export const STATUS_LABELS: Record<ConceptStatus, string> = {
  ideation: 'Ideation',
  in_review: 'In Review',
  approved: 'Approved',
  ready_for_manufacturing: 'Ready for Manufacturing',
  manufactured: 'Manufactured',
  archived: 'Archived',
};

// Editorial muted hues — see globals.css for the .st-* base classes.
export const STATUS_COLORS: Record<ConceptStatus, string> = {
  ideation: 'st-ideation',
  in_review: 'st-review',
  approved: 'st-approved',
  ready_for_manufacturing: 'st-ready',
  manufactured: 'st-mfg',
  archived: 'st-archived',
};

// Editorial palette — only "urgent" pops red (genuine alarm signal).
// The rest sit quietly in muted/border tones so they don't compete with the
// status pills next to them in the kanban + concept-detail headers.
export const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  low: 'bg-background text-muted',
  medium: 'st-ready',
  high: 'st-review',
  urgent: 'bg-red-100 text-red-700',
};

export const KANBAN_COLUMNS: ConceptStatus[] = [
  'ideation',
  'in_review',
  'approved',
  'ready_for_manufacturing',
  'manufactured',
  'archived',
];

// ───────────────────────────────────────────────────────────────────────────
// Manufacturing / Production Schedule
// ───────────────────────────────────────────────────────────────────────────

export type ProductionComplexity = 'low' | 'medium' | 'high' | 'very_high';
export type SetupComplexity = 'low' | 'medium' | 'high';
/** Which piece is being etched — the dominant driver of run time. */
export type CoilSize = 'pipe' | 'small_coil' | 'big_coil';
export type ProductionJobStatus =
  | 'backlog'
  | 'scheduled'
  | 'in_progress'
  | 'paused'
  | 'completed'
  | 'rework'
  | 'held';
export type ProductionSourceType = 'manual' | 'workflow' | 'shipstation';

export interface Machine {
  id: string;
  name: string;
  active: boolean;
  dailyPieceTarget: number;
  /** Available run hours/day — drives utilization %. */
  dailyHours: number;
  notes: string;
  position: number;
}

export interface ProductionJob {
  id: string;
  title: string;
  sourceType: ProductionSourceType;
  sourceId: string;
  /** Design Studio concept this job was created from (workflow source). */
  conceptId?: string;
  orderId: string;
  shipstationOrderId: string;
  productType: string;
  sku: string;
  quantity: number;
  complexity: ProductionComplexity;
  /** Alignment/fixturing difficulty — separate from engraving complexity. */
  setupComplexity: SetupComplexity;
  alignmentDifficulty: 'low' | 'medium' | 'high';
  detailLevel: string;
  etchingZones: number;
  repeatDesign: boolean;
  estimatedSetupMinutes: number;
  estimatedRunMinutes: number;
  estimatedFinishMinutes: number;
  estimatedTotalMinutes: number;
  actualStartTime?: string;
  actualEndTime?: string;
  actualTotalMinutes?: number;
  pausedAt?: string;
  accumulatedMinutes: number;
  machineId?: string;
  operatorId: string;
  operatorName: string;
  scheduledDate?: string;     // YYYY-MM-DD
  scheduledPosition: number;
  status: ProductionJobStatus;
  priority: PriorityLevel;
  dueDate?: string;
  shipByDate?: string;
  orderDate?: string;
  rush: boolean;
  revenueValue: number;
  inventoryAvailable: boolean;
  designName: string;
  /** Personalized name text to etch (separate from the design). */
  textName: string;
  /** Which piece — drives run-time estimate. Optional; falls back to complexity. */
  coilSize?: CoilSize;
  /** Whether the etch includes text and/or a graphic design — affects time. */
  hasText: boolean;
  hasDesign: boolean;
  designImageUrl: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  tags: string[];
  notes: string;
  designNotes: string;
  overrideReason: string;
  lockedScheduleId?: string;
  quantityCompleted: number;
  quantityFailed: number;
  reworkReason: string;
  scrapCount: number;
  /** Material / blank used (e.g. "clear glass beaker"). */
  material: string;
  /** Laser settings used — power / speed / passes notes for repeatability. */
  machineSettings: string;
  /** Quality check outcome on completion. */
  qcResult: '' | 'pass' | 'fail';
  qcNotes: string;
  /** How many times the job was paused — surfaces interruption patterns. */
  pauseCount: number;
  aiConfidence?: number;
  aiReasoning: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionDailyReport {
  id: string;
  date: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionCloseout {
  completedSummary: string;   // what got made
  unfinishedSummary: string;  // what didn't + why
  notes: string;
  // snapshot of the day's numbers at close time
  completedPieces: number;
  targetPieces: number;
  unfinishedJobs: number;
}

export interface ProductionScheduleDay {
  id: string;
  date: string;
  locked: boolean;
  lockedAt?: string;
  lockedBy: string;
  notes: string;
  closed: boolean;
  closedAt?: string;
  closedBy: string;
  closeout?: ProductionCloseout;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  aiSummary?: any;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionLog {
  id: string;
  productionJobId: string;
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  oldValue?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  newValue?: any;
  userId: string;
  userName: string;
  reason: string;
  createdAt: string;
}

export const PRODUCTION_STATUS_LABELS: Record<ProductionJobStatus, string> = {
  backlog: 'Backlog',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  paused: 'Paused',
  completed: 'Completed',
  rework: 'Needs Rework',
  held: 'Held / Problem',
};

export const COMPLEXITY_LABELS: Record<ProductionComplexity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  very_high: 'Very High',
};

/** Baseline minutes per complexity tier (total). AI / manual entry override. */
export const COMPLEXITY_BASE_MINUTES: Record<ProductionComplexity, number> = {
  low: 30,
  medium: 60,
  high: 90,
  very_high: 120,
};

export const COIL_SIZE_LABELS: Record<CoilSize, string> = {
  pipe: 'Pipe',
  small_coil: 'Small Coil',
  big_coil: 'Big Coil',
};

/**
 * Center-of-range run minutes per piece type — the dominant run-time driver.
 * Pipes etch fastest; small coils ~60-90; big coils ~90-120. Complexity then
 * nudges this ±, so e.g. small_coil spans ~64-86 across low→high.
 */
export const COIL_SIZE_BASE_MINUTES: Record<CoilSize, number> = {
  pipe: 40,
  small_coil: 75,
  big_coil: 105,
};

/** Override reasons logged when a locked schedule is changed. */
export const OVERRIDE_REASONS = [
  'Machine issue',
  'Design issue',
  'Material issue',
  'Order priority changed',
  'Operator issue',
  'Rework needed',
  'Other',
] as const;

/**
 * Admin-tunable settings for the AI production brain. Persisted in
 * app_settings under the key 'production_settings' as JSON. All weights are
 * 1-5 (higher = stronger influence on the AI schedule).
 */
export interface ProductionSettings {
  model: string;             // OpenAI model used for planning/review
  maxJobsPerPlan: number;    // cap candidates sent to the AI per request
  workdayStart: string;      // 'HH:MM'
  workdayEnd: string;        // 'HH:MM'
  bufferPct: number;         // % of machine time reserved for issues
  dailyPieceTarget: number;  // default per-machine piece target
  revenueWeight: number;     // 1-5
  dueDateWeight: number;     // 1-5
  complexityPenalty: number; // 1-5 — how hard to avoid stacking hard jobs
  testingPriority: number;   // 1-5 — how much to favor testing/internal jobs
  rushBoost: number;         // 1-5 — how strongly rush orders float up
  /** Tunable per-piece run minutes (center of range) used by the estimator. */
  coilSizeMinutes: Record<CoilSize, number>;
}

export const DEFAULT_PRODUCTION_SETTINGS: ProductionSettings = {
  model: 'gpt-4o',
  maxJobsPerPlan: 40,
  workdayStart: '09:00',
  workdayEnd: '17:00',
  bufferPct: 15,
  dailyPieceTarget: 4,
  revenueWeight: 3,
  dueDateWeight: 5,
  complexityPenalty: 3,
  testingPriority: 1,
  rushBoost: 5,
  coilSizeMinutes: { pipe: 40, small_coil: 75, big_coil: 105 },
};

/** Workday length in hours derived from start/end ('HH:MM'). */
export function workdayHours(s: ProductionSettings): number {
  const [sh, sm] = s.workdayStart.split(':').map(Number);
  const [eh, em] = s.workdayEnd.split(':').map(Number);
  const mins = (eh * 60 + em) - (sh * 60 + sm);
  return mins > 0 ? Math.round((mins / 60) * 10) / 10 : 8;
}

/** Quality / rework reasons. */
export const REWORK_REASONS = [
  'Alignment issue',
  'Burn depth issue',
  'Wrong design',
  'Wrong piece',
  'Machine issue',
  'Customer change',
  'Other',
] as const;
