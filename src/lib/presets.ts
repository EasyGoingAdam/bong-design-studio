/**
 * Preset Designs — reusable starting points for new concepts.
 *
 * A preset captures a combination of style, theme, complexity, instructions,
 * and metadata that designers can one-click-apply to a new concept.
 *
 * Presets are persisted in localStorage (per-browser). Curated presets are
 * hardcoded and always visible; user-saved presets are layered on top.
 *
 * If we ever want cross-device sync we can move these into Supabase without
 * changing the shape — that's why the shape is flat and self-contained.
 */
import { PriorityLevel, LifecycleType, CoilBaseRelationship, GenerationMode } from './types';

export interface DesignPreset {
  id: string;
  /** Human name shown in the library */
  name: string;
  /** Short one-line description */
  description: string;
  /** Category for grouping in the UI */
  category: 'geometric' | 'floral' | 'celestial' | 'minimalist' | 'cultural' | 'nature' | 'abstract' | 'seasonal' | 'custom';
  /** Tags to pre-fill on the new concept */
  tags: string[];
  /** Style phrase (fed to prompt builder) */
  stylePrompt: string;
  /** Theme phrase (fed to prompt builder) */
  themePrompt: string;
  /** Coil-specific instructions */
  coilInstructions: string;
  /** Base-specific instructions */
  baseInstructions: string;
  /** Suggested generation mode */
  mode: GenerationMode;
  /** 1-5 complexity */
  complexityLevel: 1 | 2 | 3 | 4 | 5;
  /** Coordination relationship between coil and base */
  relationship: CoilBaseRelationship;
  /** Recommended pattern density */
  patternDensity: 'low' | 'medium' | 'high' | 'very_high';
  /** Target audience phrase */
  intendedAudience: string;
  /** Default priority for concepts created from this preset */
  priority: PriorityLevel;
  /** Default lifecycle type */
  lifecycleType: LifecycleType;
  /** Optional preview image URL (for user-saved presets based on shipped concepts) */
  previewImageUrl?: string;
  /** True for curated starter presets — not user-deletable */
  curated: boolean;
  /** ISO timestamp */
  createdAt: string;
}

const CURATED: DesignPreset[] = [
  {
    id: 'preset-sacred-geometry',
    name: 'Sacred Geometry Mandala',
    description: 'Flower of life, mandalas, and radial geometric symmetry.',
    category: 'geometric',
    tags: ['geometric', 'mandala', 'sacred', 'symmetric'],
    stylePrompt: 'Sacred geometry with precise line work, radial symmetry, mandala construction',
    themePrompt: 'Flower of life patterns, interlocking circles, geometric harmony',
    coilInstructions: 'Wrap a continuous mandala frieze around the coil with unbroken geometric repetition.',
    baseInstructions: 'Centered mandala medallion with matching geometric border language from the coil.',
    mode: 'premium_luxury',
    complexityLevel: 4,
    relationship: 'exact_match',
    patternDensity: 'high',
    intendedAudience: 'Sacred geometry enthusiasts, meditation and wellness crowd',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-botanical-art-nouveau',
    name: 'Art Nouveau Botanical',
    description: 'Organic flowing lines, stylized florals, turn-of-the-century elegance.',
    category: 'floral',
    tags: ['art-nouveau', 'floral', 'organic', 'vintage'],
    stylePrompt: 'Art Nouveau with flowing organic lines, stylized botanical curves, Mucha-inspired elegance',
    themePrompt: 'Climbing vines, iris and lily forms, whiplash curves, natural ornament',
    coilInstructions: 'Climbing vine motif that wraps the coil with stylized leaves and curling tendrils.',
    baseInstructions: 'Centered flower medallion echoing the vine language — single large iris or lily as focal point.',
    mode: 'premium_luxury',
    complexityLevel: 4,
    relationship: 'thematic',
    patternDensity: 'medium',
    intendedAudience: 'Vintage design lovers, botanical and nature aesthetic',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-celestial-moon',
    name: 'Celestial Moon Phases',
    description: 'Moons, stars, cosmic imagery with bold silhouettes.',
    category: 'celestial',
    tags: ['celestial', 'moon', 'cosmic', 'night-sky'],
    stylePrompt: 'Bold celestial iconography with strong silhouettes and high contrast',
    themePrompt: 'Moon phases, constellations, stars, cosmic geometry',
    coilInstructions: 'Full cycle of moon phases wrapping around the coil, separated by star clusters.',
    baseInstructions: 'Full moon silhouette with surrounding star field — iconic focal point.',
    mode: 'production_bw',
    complexityLevel: 2,
    relationship: 'thematic',
    patternDensity: 'low',
    intendedAudience: 'Astrology fans, night-sky aesthetic, mystic minimalists',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-minimalist-line',
    name: 'Minimalist Line Art',
    description: 'Single continuous lines, maximum negative space, editorial vibe.',
    category: 'minimalist',
    tags: ['minimal', 'line-art', 'editorial', 'clean'],
    stylePrompt: 'Minimalist single-line illustration, continuous stroke, maximum negative space',
    themePrompt: 'Abstract face profile or botanical silhouette reduced to essential lines',
    coilInstructions: 'Single flowing line that travels the full wrap — one continuous gesture.',
    baseInstructions: 'Single iconic line drawing — a face, leaf, or botanical silhouette, centered.',
    mode: 'production_bw',
    complexityLevel: 1,
    relationship: 'complementary',
    patternDensity: 'low',
    intendedAudience: 'Modernists, editorial aesthetic, clean design lovers',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-japanese-wave',
    name: 'Japanese Wave & Crane',
    description: 'Hokusai waves, cranes, bamboo — traditional Japanese motifs.',
    category: 'cultural',
    tags: ['japanese', 'wave', 'crane', 'traditional'],
    stylePrompt: 'Traditional Japanese ukiyo-e style with bold wave curls and stylized natural forms',
    themePrompt: 'Great Wave off Kanagawa energy, flying cranes, bamboo groves',
    coilInstructions: 'Wave pattern wrapping the coil with cresting foam curls at rhythmic intervals.',
    baseInstructions: 'Single crane silhouette in flight, or a Mon-style family crest, centered on the base.',
    mode: 'premium_luxury',
    complexityLevel: 3,
    relationship: 'thematic',
    patternDensity: 'medium',
    intendedAudience: 'Japanese art lovers, traditional craft appreciation',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-mountain-topo',
    name: 'Mountain Topography',
    description: 'Topo map lines, mountain silhouettes, nature-core aesthetic.',
    category: 'nature',
    tags: ['mountain', 'topography', 'nature', 'outdoor'],
    stylePrompt: 'Topographic contour lines and layered mountain silhouettes with bold horizon',
    themePrompt: 'Mountain ranges, elevation contours, alpine landscape',
    coilInstructions: 'Horizontal mountain range silhouette that wraps the full coil — layered peaks with contour lines behind.',
    baseInstructions: 'Single iconic peak with topographic rings radiating out to the edge of the base.',
    mode: 'production_bw',
    complexityLevel: 2,
    relationship: 'continuation',
    patternDensity: 'medium',
    intendedAudience: 'Outdoor enthusiasts, hikers, nature lovers',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-art-deco-sunburst',
    name: 'Art Deco Sunburst',
    description: 'Gatsby-era geometry, sunburst rays, bold angular motifs.',
    category: 'geometric',
    tags: ['art-deco', 'sunburst', '1920s', 'geometric'],
    stylePrompt: 'Art Deco with bold angular rays, stepped geometry, and sunburst motifs',
    themePrompt: 'Sunbursts, Chrysler Building stepping, fan shapes, jazz-age luxury',
    coilInstructions: 'Repeating vertical sunburst fans around the coil, separated by thin vertical bars.',
    baseInstructions: 'Centered sunburst radiating to the edge with a stepped deco frame.',
    mode: 'premium_luxury',
    complexityLevel: 3,
    relationship: 'exact_match',
    patternDensity: 'medium',
    intendedAudience: 'Vintage luxury aesthetic, roaring 20s fans',
    priority: 'medium',
    lifecycleType: 'evergreen',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'preset-halloween',
    name: 'Halloween Gothic',
    description: 'Bats, moons, cobwebs — seasonal drop for October.',
    category: 'seasonal',
    tags: ['halloween', 'gothic', 'seasonal', 'spooky'],
    stylePrompt: 'Gothic Halloween iconography with bold silhouettes and high contrast',
    themePrompt: 'Flying bats, crescent moons, cobwebs, haunted forest trees',
    coilInstructions: 'Procession of bats flying in formation around the coil, with bare tree branches reaching up.',
    baseInstructions: 'Full moon centered, silhouetted bats crossing, single spider dangling from a web.',
    mode: 'seasonal_drop',
    complexityLevel: 3,
    relationship: 'thematic',
    patternDensity: 'medium',
    intendedAudience: 'Halloween seasonal buyers, gothic aesthetic',
    priority: 'high',
    lifecycleType: 'seasonal',
    curated: true,
    createdAt: '2025-01-01T00:00:00Z',
  },
];

const LS_KEY = 'design-studio:user-presets:v1';

function readUserPresets(): DesignPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeUserPresets(presets: DesignPreset[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(presets));
  } catch (err) {
    // Propagate quota-exceeded errors so UI can show a real message rather
    // than silently dropping the save.
    console.error('Failed to save user presets:', err);
    throw new Error(
      'Could not save preset — browser storage is full. Try deleting old presets or remove the preview image.'
    );
  }
}

export function getAllPresets(): DesignPreset[] {
  return [...CURATED, ...readUserPresets()];
}

export function getCuratedPresets(): DesignPreset[] {
  return CURATED;
}

export function getUserPresets(): DesignPreset[] {
  return readUserPresets();
}

export function saveUserPreset(preset: Omit<DesignPreset, 'id' | 'curated' | 'createdAt'>): DesignPreset {
  // Reject data-URI preview images — they blow localStorage's ~5 MB quota
  // after only a handful of presets. Only accept http(s) thumbnails (i.e.
  // images already uploaded to Supabase Storage).
  let previewImageUrl = preset.previewImageUrl;
  if (previewImageUrl && previewImageUrl.startsWith('data:')) {
    console.warn('Stripped data-URI preview image from preset — too large for localStorage.');
    previewImageUrl = undefined;
  }

  const full: DesignPreset = {
    ...preset,
    previewImageUrl,
    id: `preset-user-${Date.now()}`,
    curated: false,
    createdAt: new Date().toISOString(),
  };

  const existing = readUserPresets();

  // Dedupe by name (case-insensitive) — replace existing user preset with the
  // same name rather than pile up duplicates.
  const withoutDuplicate = existing.filter(
    (p) => p.name.trim().toLowerCase() !== full.name.trim().toLowerCase()
  );

  writeUserPresets([full, ...withoutDuplicate]);
  return full;
}

export function deleteUserPreset(id: string) {
  const existing = readUserPresets();
  writeUserPresets(existing.filter((p) => p.id !== id));
}

export const PRESET_CATEGORIES: { id: DesignPreset['category']; label: string; emoji: string }[] = [
  { id: 'geometric', label: 'Geometric', emoji: '◆' },
  { id: 'floral', label: 'Floral', emoji: '❀' },
  { id: 'celestial', label: 'Celestial', emoji: '☾' },
  { id: 'minimalist', label: 'Minimalist', emoji: '|' },
  { id: 'cultural', label: 'Cultural', emoji: '⛩' },
  { id: 'nature', label: 'Nature', emoji: '▲' },
  { id: 'abstract', label: 'Abstract', emoji: '◯' },
  { id: 'seasonal', label: 'Seasonal', emoji: '❄' },
  { id: 'custom', label: 'Custom', emoji: '★' },
];
