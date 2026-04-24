'use client';

import { useState } from 'react';
import { Concept } from '@/lib/types';
import { DesignPreset, PRESET_CATEGORIES, saveUserPreset } from '@/lib/presets';
import { useToast } from './toast';

interface Props {
  concept: Concept;
  onClose: () => void;
}

/**
 * Capture a concept's style, theme, and instructions as a reusable preset
 * that will show up in the Presets tab going forward.
 */
export function SavePresetModal({ concept, onClose }: Props) {
  const { toast } = useToast();
  const [name, setName] = useState(concept.name);
  const [description, setDescription] = useState(concept.description || '');
  const [category, setCategory] = useState<DesignPreset['category']>('custom');
  const [includePreviewImage, setIncludePreviewImage] = useState(true);
  const [saving, setSaving] = useState(false);

  const previewUrl = concept.combinedImageUrl || concept.coilImageUrl || concept.baseImageUrl || '';

  const save = () => {
    if (!name.trim()) {
      toast('Preset name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      saveUserPreset({
        name: name.trim(),
        description: description.trim() || `Saved from "${concept.name}"`,
        category,
        tags: [...concept.tags],
        stylePrompt: concept.specs.designStyleName || '',
        themePrompt: concept.specs.designTheme || '',
        coilInstructions: concept.coilSpecs.notes || '',
        baseInstructions: concept.baseSpecs.notes || '',
        mode: 'production_bw',
        complexityLevel: concept.specs.laserComplexity || 3,
        relationship: concept.specs.coordinationMode || 'thematic',
        patternDensity: concept.specs.patternDensity || 'medium',
        intendedAudience: concept.intendedAudience || '',
        priority: concept.priority,
        lifecycleType: concept.lifecycleType,
        previewImageUrl: includePreviewImage && previewUrl ? previewUrl : undefined,
      });
      toast(`Saved "${name}" to your preset library`, 'success');
      onClose();
    } catch {
      toast('Failed to save preset', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Save as Preset</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-muted">
            Capture this concept&apos;s style, theme, and instructions so you can one-click create similar concepts later.
          </p>

          <div>
            <label className="block text-xs font-medium mb-1.5">Preset name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1.5">Category</label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    category === cat.id
                      ? 'bg-accent text-white border-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  <span className="mr-1">{cat.emoji}</span>
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {previewUrl && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={includePreviewImage}
                onChange={(e) => setIncludePreviewImage(e.target.checked)}
                className="accent-accent"
              />
              Include concept image as thumbnail
            </label>
          )}

          <div className="pt-2 border-t border-border flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2 bg-background border border-border hover:bg-surface-hover rounded-lg text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={saving || !name.trim()}
              className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Preset'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
