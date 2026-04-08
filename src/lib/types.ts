export type ConceptStatus =
  | 'ideation'
  | 'in_review'
  | 'approved'
  | 'ready_for_manufacturing'
  | 'manufactured'
  | 'archived';

export type LifecycleType = 'seasonal' | 'evergreen' | 'limited_edition' | 'custom';
export type PriorityLevel = 'low' | 'medium' | 'high' | 'urgent';
export type CoilBaseRelationship = 'exact_match' | 'mirror' | 'thematic' | 'loose';
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
  coilImageUrl: string;
  baseImageUrl: string;
  combinedImageUrl: string;
  specs: ConceptSpecs;
  coilSpecs: CoilSpecs;
  baseSpecs: BaseSpecs;
  priority: PriorityLevel;
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

export const STATUS_COLORS: Record<ConceptStatus, string> = {
  ideation: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  in_review: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  ready_for_manufacturing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  manufactured: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  archived: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};

export const PRIORITY_COLORS: Record<PriorityLevel, string> = {
  low: 'bg-slate-500/20 text-slate-400',
  medium: 'bg-blue-500/20 text-blue-400',
  high: 'bg-orange-500/20 text-orange-400',
  urgent: 'bg-red-500/20 text-red-400',
};

export const KANBAN_COLUMNS: ConceptStatus[] = [
  'ideation',
  'in_review',
  'approved',
  'ready_for_manufacturing',
  'manufactured',
];
