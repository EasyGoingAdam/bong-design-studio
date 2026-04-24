'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { DesignPreset, PRESET_CATEGORIES, saveUserPreset } from '@/lib/presets';
import { useToast } from './toast';

interface Props {
  onClose: () => void;
  onGenerated: () => void;
}

type DraftPreset = Omit<DesignPreset, 'id' | 'curated' | 'createdAt' | 'previewImageUrl' | 'priority' | 'lifecycleType' | 'mode'>;

const EXAMPLES = [
  'Vintage tattoo flash — bold outlines, nautical icons, old-school Americana',
  'Scandinavian folk — clean hand-cut paper feel, reindeer and pine motifs',
  'Psychedelic 60s poster — swirling lettering shapes, cosmic mushrooms',
  'Industrial blueprint — architectural line art, cross-sections, technical annotations',
  'Victorian natural history — engraved botanical and insect specimens',
];

/**
 * Natural-language preset generator. User types a style description,
 * GPT-4o-mini returns a full preset config, user reviews it and either
 * saves or tweaks.
 */
export function GeneratePresetModal({ onClose, onGenerated }: Props) {
  const { openAIKey } = useAppStore();
  const { toast } = useToast();

  const [description, setDescription] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState<DraftPreset | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const generate = async () => {
    if (!openAIKey) {
      setError('Set your OpenAI API key in Settings first.');
      return;
    }
    if (!description.trim()) {
      setError('Describe the style you want a preset for.');
      return;
    }
    setGenerating(true);
    setError('');
    setDraft(null);
    try {
      const res = await fetch('/api/generate-preset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description.trim(), apiKey: openAIKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Generation failed');
        return;
      }
      setDraft(data.preset);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const save = () => {
    if (!draft) return;
    try {
      saveUserPreset({
        ...draft,
        priority: 'medium',
        lifecycleType: 'evergreen',
        mode: 'production_bw',
      });
      toast(`Saved "${draft.name}" to your preset library`, 'success');
      onGenerated();
      onClose();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Failed to save preset', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <span>✦</span> Generate Preset from Description
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Describe any style in plain English. AI returns a full preset — name, style, theme, instructions, complexity.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1.5">Style description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Brutalist concrete architecture meets botanical engraving"
              rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              <span className="text-[10px] text-muted">Examples:</span>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  onClick={() => setDescription(ex)}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-foreground hover:border-accent/60 transition-colors"
                >
                  {ex.split(' — ')[0]}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generate}
            disabled={generating || !description.trim()}
            className="w-full py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {generating ? 'Generating…' : draft ? 'Re-generate' : '✦ Generate Preset'}
          </button>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
          )}

          {draft && (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="text-xs font-medium text-muted">Preview — edit before saving</div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Name</label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Category</label>
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value as DesignPreset['category'] })}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
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
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1">Style prompt</label>
                <textarea
                  value={draft.stylePrompt}
                  onChange={(e) => setDraft({ ...draft, stylePrompt: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1">Theme prompt</label>
                <textarea
                  value={draft.themePrompt}
                  onChange={(e) => setDraft({ ...draft, themePrompt: e.target.value })}
                  rows={2}
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium mb-1">Coil instructions</label>
                  <textarea
                    value={draft.coilInstructions}
                    onChange={(e) => setDraft({ ...draft, coilInstructions: e.target.value })}
                    rows={2}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent resize-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Base instructions</label>
                  <textarea
                    value={draft.baseInstructions}
                    onChange={(e) => setDraft({ ...draft, baseInstructions: e.target.value })}
                    rows={2}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent resize-none"
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
                    onChange={(e) => setDraft({ ...draft, complexityLevel: Math.max(1, Math.min(5, Number(e.target.value))) as 1 | 2 | 3 | 4 | 5 })}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium mb-1">Density</label>
                  <select
                    value={draft.patternDensity}
                    onChange={(e) => setDraft({ ...draft, patternDensity: e.target.value as DesignPreset['patternDensity'] })}
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
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
                    className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
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
                  className="w-full bg-background border border-border rounded px-2 py-1 text-xs focus:outline-none focus:border-accent"
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
                  Save to library
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
