'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

export interface EditImageResult {
  url: string;
}

interface Props {
  /** The image being edited. Can be an http URL or a data URI. */
  imageUrl: string;
  /** What this image represents — "coil" or "base" — used for toast copy only */
  label: string;
  /** Callback fired when an edit produces a new image URL. Parent decides what to do with it. */
  onEdited: (result: EditImageResult) => void;
  /** Close the modal */
  onClose: () => void;
}

const QUICK_CHIPS: { label: string; prompt: string }[] = [
  { label: 'Clean up details', prompt: 'Clean up the composition: remove extraneous noise and unnecessary micro-detail while keeping the main forms intact.' },
  { label: 'Increase contrast', prompt: 'Push contrast to pure black and white — strengthen the black, brighten the white, eliminate any gray wash.' },
  { label: 'Simplify pattern', prompt: 'Simplify the pattern — merge redundant elements, reduce repetition, keep only the most iconic details.' },
  { label: 'Thicken lines', prompt: 'Thicken all primary lines so the design reads better at small engraving size. Prefer bolder strokes over fine hatching.' },
  { label: 'Reduce clutter', prompt: 'Reduce visual clutter — open up negative space around the main subject, eliminate busy background elements.' },
  { label: 'Sharpen subject', prompt: 'Sharpen and clarify the central subject. Make it the clear focal point with stronger silhouette.' },
  { label: 'Improve symmetry', prompt: 'Improve symmetry and balance — align elements more carefully, correct any lopsided areas.' },
  { label: 'Better for engraving', prompt: 'Rework this for laser etching viability: eliminate any grayscale, remove micro-textures that will blur, boost line weight.' },
  { label: 'More black subject', prompt: 'Emphasize the black subject — more solid black fills, less open interior, stronger presence.' },
  { label: 'White background only', prompt: 'Make the background pure white. Remove any background textures, fills, or shading.' },
  { label: 'More geometric', prompt: 'Make the design more geometric — use cleaner straight lines, regular angles, structured repetition.' },
  { label: 'Less chaotic', prompt: 'Calm the design down — less chaos, more order, clearer visual hierarchy.' },
];

type Strength = 'subtle' | 'medium' | 'major';

export function EditImageModal({ imageUrl, label, onEdited, onClose }: Props) {
  const { openAIKey } = useAppStore();
  const { toast } = useToast();

  const [freeText, setFreeText] = useState('');
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [strength, setStrength] = useState<Strength>('medium');
  const [preserveComposition, setPreserveComposition] = useState(true);
  const [preserveSubject, setPreserveSubject] = useState(true);

  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState('');
  const [lastPrompt, setLastPrompt] = useState('');

  const toggleChip = (chipLabel: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipLabel)) next.delete(chipLabel);
      else next.add(chipLabel);
      return next;
    });
  };

  const composedPrompt = [
    ...Array.from(selectedChips).map((l) => QUICK_CHIPS.find((c) => c.label === l)?.prompt || ''),
    freeText.trim(),
  ]
    .filter(Boolean)
    .join(' ');

  const canRun = !!composedPrompt && !editing;

  const run = async () => {
    if (!openAIKey) {
      setError('Set your OpenAI API key in Settings first.');
      return;
    }
    if (!composedPrompt) {
      setError('Pick a quick chip or type an adjustment first.');
      return;
    }
    setEditing(true);
    setError('');
    setPreview('');

    try {
      const res = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          editPrompt: composedPrompt,
          apiKey: openAIKey,
          strength,
          preserveComposition,
          preserveSubject,
          folder: 'edited',
          filename: label,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Edit failed');
        return;
      }
      setPreview(data.url);
      setLastPrompt(data.prompt || composedPrompt);
    } catch {
      setError('Network error — please try again.');
    } finally {
      setEditing(false);
    }
  };

  const accept = () => {
    if (!preview) return;
    onEdited({ url: preview });
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} updated`, 'success');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold">Edit {label.charAt(0).toUpperCase() + label.slice(1)} Image</h2>
            <p className="text-xs text-muted mt-0.5">
              Make small targeted changes without regenerating from scratch.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">
            ×
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Side-by-side preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">Original</div>
              <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border overflow-hidden">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Original" className="w-full h-full object-contain" />
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
                {preview ? 'Edited preview' : 'Preview appears here'}
              </div>
              <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border overflow-hidden flex items-center justify-center">
                {editing ? (
                  <div className="flex flex-col items-center gap-2 text-muted">
                    <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Applying edit…</span>
                  </div>
                ) : preview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt="Edited" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-muted">No preview yet</span>
                )}
              </div>
            </div>
          </div>

          {/* Quick-edit chips */}
          <div>
            <div className="text-xs font-medium mb-1.5">Quick edits</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_CHIPS.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => toggleChip(c.label)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    selectedChips.has(c.label)
                      ? 'bg-accent text-white border-accent'
                      : 'bg-background border-border text-muted hover:text-foreground hover:border-border-light'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Free-text adjustment */}
          <div>
            <label className="block text-xs font-medium mb-1.5">
              Custom adjustment <span className="text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder='e.g. "remove the outer border", "make the eyes larger", "add a subtle stipple texture to the mountain"'
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* Strength + toggles */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <div className="text-xs font-medium mb-1.5">Strength</div>
              <div className="flex gap-1 bg-background border border-border rounded-lg p-0.5">
                {(['subtle', 'medium', 'major'] as Strength[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStrength(s)}
                    className={`flex-1 text-xs py-1 rounded transition-colors capitalize ${
                      strength === s ? 'bg-accent text-white' : 'text-muted hover:text-foreground'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium mb-1.5">Preserve</div>
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={preserveComposition}
                    onChange={(e) => setPreserveComposition(e.target.checked)}
                    className="accent-accent"
                  />
                  Composition
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={preserveSubject}
                    onChange={(e) => setPreserveSubject(e.target.checked)}
                    className="accent-accent"
                  />
                  Main subject
                </label>
              </div>
            </div>
            <div className="flex flex-col justify-end">
              <button
                onClick={run}
                disabled={!canRun}
                className="w-full py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {editing ? 'Editing…' : preview ? 'Re-apply' : 'Apply Edit'}
              </button>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
          )}

          {lastPrompt && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-foreground">
                View full prompt sent to OpenAI
              </summary>
              <pre className="mt-1.5 p-2 bg-background border border-border rounded text-[10px] text-muted whitespace-pre-wrap">
                {lastPrompt}
              </pre>
            </details>
          )}

          {/* Accept / discard */}
          {preview && !editing && (
            <div className="flex gap-2 pt-2 border-t border-border">
              <button
                onClick={accept}
                className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                ✓ Keep this version
              </button>
              <button
                onClick={() => {
                  setPreview('');
                  setLastPrompt('');
                }}
                className="flex-1 py-2 bg-background border border-border hover:bg-surface-hover rounded-lg text-sm font-medium transition-colors"
              >
                Discard
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
