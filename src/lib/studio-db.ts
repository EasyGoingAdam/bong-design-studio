/**
 * Row ↔ frontend mappers + types for the Bong Design Studio 2.0 data model
 * (product_templates, design_projects, design_targets, design_versions).
 */

export interface ProductTemplate {
  id: string;
  productName: string;
  targetName: string;
  targetType: string;
  widthIn: number | null;
  heightIn: number | null;
  units: string;
  aspectRatio: number | null;
  shape: string;
  supportsWrap: boolean;
  seamlessDefault: boolean;
  previewImage: string;
  machineProfile: string;
  sortOrder: number;
  active: boolean;
}

export interface DesignVersion {
  id: string;
  targetId: string;
  versionNumber: number;
  parentVersionId: string | null;
  feedback: string;
  generationPrompt: string;
  imageUrl: string;
  rawImageUrl: string;
  pngUrl: string;
  svgUrl: string;
  jpgUrl: string;
  inverted: boolean;
  blackCoverage: number | null;
  generationProvider: string;
  createdBy: string;
  createdAt: string;
}

export interface DesignTarget {
  id: string;
  projectId: string;
  name: string;
  targetType: string;
  productTemplateId: string | null;
  physicalWidth: number | null;
  physicalHeight: number | null;
  units: string;
  aspectRatio: number | null;
  shape: string;
  wrap: boolean;
  seamless: boolean;
  detailLevel: string;
  etchCoverage: string;
  currentVersionId: string | null;
  sortOrder: number;
  versions?: DesignVersion[];
  currentVersion?: DesignVersion | null;
}

export interface DesignProject {
  id: string;
  name: string;
  originalRequest: string;
  refinedPrompt: string;
  productName: string;
  type: string;          // single | set
  relationship: string;  // same | coordinated
  status: string;        // draft | favorite | approved | produced | archived
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  targets?: DesignTarget[];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function toTemplate(r: any): ProductTemplate {
  return {
    id: r.id, productName: r.product_name, targetName: r.target_name, targetType: r.target_type ?? 'coil',
    widthIn: r.width_in ?? null, heightIn: r.height_in ?? null, units: r.units ?? 'in',
    aspectRatio: r.aspect_ratio ?? (r.width_in && r.height_in ? r.width_in / r.height_in : null),
    shape: r.shape ?? 'standard', supportsWrap: !!r.supports_wrap, seamlessDefault: !!r.seamless_default,
    previewImage: r.preview_image ?? '', machineProfile: r.machine_profile ?? '', sortOrder: r.sort_order ?? 0, active: r.active !== false,
  };
}

export function toVersion(r: any): DesignVersion {
  return {
    id: r.id, targetId: r.target_id, versionNumber: r.version_number ?? 1, parentVersionId: r.parent_version_id ?? null,
    feedback: r.feedback ?? '', generationPrompt: r.generation_prompt ?? '', imageUrl: r.image_url ?? '',
    rawImageUrl: r.raw_image_url ?? '', pngUrl: r.png_url ?? '', svgUrl: r.svg_url ?? '', jpgUrl: r.jpg_url ?? '',
    inverted: !!r.inverted, blackCoverage: r.black_coverage ?? null, generationProvider: r.generation_provider ?? '',
    createdBy: r.created_by ?? '', createdAt: r.created_at,
  };
}

export function toTarget(r: any): DesignTarget {
  return {
    id: r.id, projectId: r.project_id, name: r.name, targetType: r.target_type ?? 'coil',
    productTemplateId: r.product_template_id ?? null, physicalWidth: r.physical_width ?? null, physicalHeight: r.physical_height ?? null,
    units: r.units ?? 'in', aspectRatio: r.aspect_ratio ?? null, shape: r.shape ?? 'standard', wrap: !!r.wrap, seamless: !!r.seamless,
    detailLevel: r.detail_level ?? 'balanced', etchCoverage: r.etch_coverage ?? 'medium',
    currentVersionId: r.current_version_id ?? null, sortOrder: r.sort_order ?? 0,
  };
}

export function toProject(r: any): DesignProject {
  return {
    id: r.id, name: r.name, originalRequest: r.original_request ?? '', refinedPrompt: r.refined_prompt ?? '',
    productName: r.product_name ?? '', type: r.type ?? 'single', relationship: r.relationship ?? 'coordinated',
    status: r.status ?? 'draft', createdBy: r.created_by ?? '', createdAt: r.created_at, updatedAt: r.updated_at,
  };
}
