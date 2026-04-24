'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  DesignPreset,
  PRESET_CATEGORIES,
  getCuratedPresets,
  getUserPresets,
  deleteUserPreset,
} from '@/lib/presets';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';

interface Props {
  onOpenConcept: (id: string) => void;
}

/**
 * Preset Designs library — curated starting points + user-saved presets.
 * Click a preset card → creates a new concept pre-filled with that preset's
 * style, theme, instructions, and metadata, then opens the concept detail.
 */
export function PresetLibrary({ onOpenConcept }: Props) {
  const { addConcept } = useAppStore();
  const { toast } = useToast();

  // Read user presets in an effect to avoid SSR/CSR hydration mismatch —
  // localStorage is client-only, so the first render must match the server's
  // empty read, then we populate after mount.
  const [userPresets, setUserPresets] = useState<DesignPreset[]>([]);
  const [category, setCategory] = useState<'all' | DesignPreset['category']>('all');
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<DesignPreset | null>(null);
  const [applying, setApplying] = useState<string | null>(null);

  const refreshUserPresets = () => setUserPresets(getUserPresets());

  useEffect(() => {
    refreshUserPresets();
  }, []);

  const curated = useMemo(() => getCuratedPresets(), []);

  const all = useMemo(() => [...curated, ...userPresets], [curated, userPresets]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return all.filter((p) => {
      if (category !== 'all' && p.category !== category) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.stylePrompt.toLowerCase().includes(q) ||
        p.themePrompt.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [all, category, search]);

  const countByCategory = useMemo(() => {
    const m: Record<string, number> = { all: all.length };
    for (const cat of PRESET_CATEGORIES) {
      m[cat.id] = all.filter((p) => p.category === cat.id).length;
    }
    return m;
  }, [all]);

  const applyPreset = async (preset: DesignPreset) => {
    if (applying) return;
    setApplying(preset.id);
    try {
      const concept = await addConcept({
        name: `${preset.name} — New`,
        description: preset.description,
        tags: [...preset.tags],
        priority: preset.priority,
        lifecycleType: preset.lifecycleType,
        intendedAudience: preset.intendedAudience,
        specs: {
          designStyleName: preset.stylePrompt,
          designTheme: preset.themePrompt,
          patternDensity: preset.patternDensity,
          laserComplexity: preset.complexityLevel,
          estimatedEtchingTime: '',
          surfaceCoverage: 50,
          lineThickness: '',
          bwContrastGuidance: 'High contrast, pure black and white only',
          symmetryRequirement: 'none',
          coordinationMode: preset.relationship,
          productionFeasibility: 3,
          riskNotes: '',
        },
        coilSpecs: { dimensions: '', printableArea: '', notes: preset.coilInstructions },
        baseSpecs: { dimensions: '', printableArea: '', notes: preset.baseInstructions },
      });
      toast(`Created concept from "${preset.name}"`, 'success');
      onOpenConcept(concept.id);
    } catch (err) {
      console.error(err);
      toast('Failed to create concept from preset', 'error');
    } finally {
      setApplying(null);
    }
  };

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteUserPreset(deleteTarget.id);
    toast(`Deleted preset "${deleteTarget.name}"`, 'info');
    setDeleteTarget(null);
    refreshUserPresets();
  };

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-5 gap-4 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">Preset Designs</h2>
          <p className="text-sm text-muted">
            One-click starting points — click a preset to create a new concept with that style, theme, and instructions already filled in.
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search presets — style, theme, tag…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-sm px-1"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Category pills */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        <button
          onClick={() => setCategory('all')}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            category === 'all'
              ? 'bg-accent text-white border-accent'
              : 'bg-surface border-border text-muted hover:text-foreground'
          }`}
        >
          All <span className="opacity-60">({countByCategory.all})</span>
        </button>
        {PRESET_CATEGORIES.map((cat) => {
          const count = countByCategory[cat.id] || 0;
          if (count === 0) return null;
          return (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                category === cat.id
                  ? 'bg-accent text-white border-accent'
                  : 'bg-surface border-border text-muted hover:text-foreground'
              }`}
            >
              <span className="mr-1">{cat.emoji}</span>
              {cat.label} <span className="opacity-60">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted text-sm">
          No presets match your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((preset) => {
            const categoryMeta = PRESET_CATEGORIES.find((c) => c.id === preset.category);
            return (
              <div
                key={preset.id}
                className="group bg-surface border border-border rounded-xl overflow-hidden hover:border-accent/60 transition-colors flex flex-col"
              >
                <div className="aspect-[16/10] bg-background placeholder-pattern relative overflow-hidden">
                  {preset.previewImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={preset.previewImageUrl}
                      alt={preset.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-4xl text-muted/40">
                      {categoryMeta?.emoji || '◯'}
                    </div>
                  )}
                  {!preset.curated && (
                    <span className="absolute top-2 right-2 text-[10px] bg-accent text-white px-2 py-0.5 rounded-full">
                      Your preset
                    </span>
                  )}
                </div>
                <div className="p-3 flex-1 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold truncate">{preset.name}</h3>
                    <span className="text-[10px] text-muted shrink-0">
                      L{preset.complexityLevel}
                    </span>
                  </div>
                  <p className="text-xs text-muted mt-1 line-clamp-2">{preset.description}</p>
                  {preset.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {preset.tags.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-3 pt-3 border-t border-border flex gap-2">
                    <button
                      onClick={() => applyPreset(preset)}
                      disabled={applying === preset.id}
                      className="flex-1 py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded transition-colors disabled:opacity-50"
                    >
                      {applying === preset.id ? 'Creating…' : '+ Use Preset'}
                    </button>
                    {!preset.curated && (
                      <button
                        onClick={() => setDeleteTarget(preset)}
                        className="px-2 py-1.5 text-xs text-muted hover:text-red-600 border border-border hover:border-red-300 rounded transition-colors"
                        title="Delete preset"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete preset?"
        message={`Permanently delete "${deleteTarget?.name}" from your preset library. This cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
