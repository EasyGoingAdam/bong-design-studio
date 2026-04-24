'use client';

import { useState } from 'react';
import { DesignPreset, PRESET_CATEGORIES, updateUserPreset } from '@/lib/presets';
import { Modal } from './ui';
import { useToast } from './toast';

interface Props {
  preset: DesignPreset;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Edit an existing user-saved preset. Curated presets are not editable —
 * the caller should only surface this for presets where `curated === false`.
 */
export function EditPresetModal({ preset, onClose, onSaved }: Props) {
  const { toast } = useToast();
  const [draft, setDraft] = useState<DesignPreset>(preset);

  const save = () => {
    if (!draft.name.trim()) {
      toast('Preset name is required', 'error');
      return;
    }
    try {
      updateUserPreset(preset.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category,
        tags: draft.tags,
        stylePrompt: draft.stylePrompt,
        themePrompt: draft.themePrompt,
        coilInstructions: draft.coilInstructions,
        baseInstructions: draft.baseInstructions,
        complexityLevel: draft.complexityLevel,
        relationship: draft.relationship,
        patternDensity: draft.patternDensity,
        intendedAudience: draft.intendedAudience,
        priority: draft.priority,
        lifecycleType: draft.lifecycleType,
      });
      toast('Preset updated', 'success');
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to update preset', 'error');
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Edit Preset"
      subtitle="Changes apply to new concepts created from this preset going forward."
      maxWidth="max-w-2xl"
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1">Name</label>
            <input
              type="text"
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1">Category</label>
            <select
              value={draft.category}
              onChange={(e) => setDraft({ ...draft, category: e.target.value as DesignPreset['category'] })}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
            >
              {PRESET_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.emoji} {c.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium mb-1">Description</label>
          <input
            type="text"
            value={draft.description}
            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium mb-1">Style prompt</label>
          <textarea
            value={draft.stylePrompt}
            onChange={(e) => setDraft({ ...draft, stylePrompt: e.target.value })}
            rows={2}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div>
          <label className="block text-[11px] font-medium mb-1">Theme prompt</label>
          <textarea
            value={draft.themePrompt}
            onChange={(e) => setDraft({ ...draft, themePrompt: e.target.value })}
            rows={2}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1">Coil instructions</label>
            <textarea
              value={draft.coilInstructions}
              onChange={(e) => setDraft({ ...draft, coilInstructions: e.target.value })}
              rows={2}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent resize-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1">Base instructions</label>
            <textarea
              value={draft.baseInstructions}
              onChange={(e) => setDraft({ ...draft, baseInstructions: e.target.value })}
              rows={2}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent resize-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-medium mb-1">Complexity</label>
            <input
              type="number"
              min={1}
              max={5}
              value={draft.complexityLevel}
              onChange={(e) =>
                setDraft({ ...draft, complexityLevel: Math.max(1, Math.min(5, Number(e.target.value))) as 1 | 2 | 3 | 4 | 5 })
              }
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1">Density</label>
            <select
              value={draft.patternDensity}
              onChange={(e) => setDraft({ ...draft, patternDensity: e.target.value as DesignPreset['patternDensity'] })}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="very_high">Very high</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-medium mb-1">Relationship</label>
            <select
              value={draft.relationship}
              onChange={(e) => setDraft({ ...draft, relationship: e.target.value as DesignPreset['relationship'] })}
              className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
            >
              <option value="exact_match">Exact match</option>
              <option value="mirror">Mirror</option>
              <option value="thematic">Thematic</option>
              <option value="loose">Loose</option>
              <option value="complementary">Complementary</option>
              <option value="contrast">Contrast</option>
              <option value="continuation">Continuation</option>
              <option value="independent">Independent</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium mb-1">Tags (comma-separated)</label>
          <input
            type="text"
            value={draft.tags.join(', ')}
            onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
            className="w-full bg-background border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
          />
        </div>

        <div className="flex gap-2 pt-3 border-t border-border">
          <button
            onClick={onClose}
            className="flex-1 py-2 bg-background border border-border hover:bg-surface-hover rounded-lg text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={save}
            className="flex-1 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            Save changes
          </button>
        </div>
      </div>
    </Modal>
  );
}
