'use client';

import { useEffect, useState } from 'react';
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
  /** Optional concept id — used to build a unique storage filename so edits
   *  across different concepts don't collide at the same storage path. When
   *  omitted (e.g. editing a yet-to-be-saved generation on the AI Generate
   *  tab), we fall back to a `standalone-<timestamp>` filename. */
  conceptId?: string;
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
type RunMode = 'edit' | 'redo';

/**
 * One iteration of the edit pipeline. Every Apply click pushes a new
 * attempt onto the array — nothing is destroyed.
 *
 * `kind` distinguishes:
 *   - 'edit' — a small targeted change via /v1/images/edits, preserves
 *     composition. Branches off whichever source the user picked.
 *   - 'redo' — a complete regeneration via /v1/images/generations using
 *     the user's prompt as the instruction. Ignores the source image
 *     entirely. Use when a small edit can't get there.
 */
interface EditAttempt {
  id: string;
  url: string;
  kind: 'edit' | 'redo';
  promptSentToOpenAI: string;
  composedPromptText: string;       // user-facing summary of what was asked
  basedOnLabel: string;             // 'Original' | 'Attempt N' | 'New generation'
  strength: Strength;
  preserveComposition: boolean;
  preserveSubject: boolean;
  createdAt: number;
}

export function EditImageModal({ imageUrl, label, conceptId, onEdited, onClose }: Props) {
  const { openAIKey } = useAppStore();
  const { toast } = useToast();

  // ---------- form state ----------
  const [freeText, setFreeText] = useState('');
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [strength, setStrength] = useState<Strength>('medium');
  const [preserveComposition, setPreserveComposition] = useState(true);
  const [preserveSubject, setPreserveSubject] = useState(true);

  // 'edit' = small targeted change (default). 'redo' = full regenerate
  // from the user's prompt. Both produce new attempts in the history
  // strip so users can compare the two approaches side-by-side.
  const [runMode, setRunMode] = useState<RunMode>('edit');

  // ---------- session edit history ----------
  const [attempts, setAttempts] = useState<EditAttempt[]>([]);
  /** Index of the attempt currently shown in the big preview pane. null
   *  means "no attempts yet" (or user dismissed all). */
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  /** Index of the attempt that the NEXT edit will modify. null means
   *  "edit from the original". This is what enables branching. */
  const [sourceIdx, setSourceIdx] = useState<number | null>(null);

  // ---------- per-call state ----------
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');

  // ---------- AI suggestions (vision) ----------
  const [aiSuggestions, setAiSuggestions] = useState<{ label: string; prompt: string }[]>([]);
  const [suggesting, setSuggesting] = useState(false);

  // ---------- escape-to-close ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // ---------- derived ----------
  const activeAttempt = activeIdx !== null && attempts[activeIdx] ? attempts[activeIdx] : null;
  /** The image we'll send as the source for the NEXT edit. */
  const sourceUrl = sourceIdx !== null && attempts[sourceIdx] ? attempts[sourceIdx].url : imageUrl;
  const sourceLabel = sourceIdx !== null && attempts[sourceIdx] ? `Attempt ${sourceIdx + 1}` : 'Original';

  const allChips = [...aiSuggestions, ...QUICK_CHIPS];
  const composedPrompt = [
    ...Array.from(selectedChips).map((l) => allChips.find((c) => c.label === l)?.prompt || ''),
    freeText.trim(),
  ]
    .filter(Boolean)
    .join(' ');
  const composedPromptText = [
    ...Array.from(selectedChips),
    freeText.trim(),
  ]
    .filter(Boolean)
    .join(' · ');

  const toggleChip = (chipLabel: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(chipLabel)) next.delete(chipLabel);
      else next.add(chipLabel);
      return next;
    });
  };

  // ---------- AI suggestions fetch ----------
  const fetchSuggestions = async () => {
    if (!openAIKey) {
      setError('Set your OpenAI API key in Settings first.');
      return;
    }
    if (sourceUrl.startsWith('data:')) {
      setError('AI suggestions need a saved image — please save the concept first.');
      return;
    }
    setSuggesting(true);
    setError('');
    try {
      const res = await fetch('/api/suggest-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: sourceUrl, apiKey: openAIKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not fetch suggestions');
        return;
      }
      setAiSuggestions(data.suggestions || []);
    } catch {
      setError('Network error — could not fetch suggestions.');
    } finally {
      setSuggesting(false);
    }
  };

  // ---------- run edit OR total redo ----------
  const canRun = !!composedPrompt && !editing;

  const run = async () => {
    if (!openAIKey) {
      setError('Set your OpenAI API key in Settings first.');
      return;
    }
    if (!composedPrompt) {
      setError(runMode === 'redo'
        ? 'Type a description for the redo first.'
        : 'Pick a quick chip or type an adjustment first.');
      return;
    }
    setEditing(true);
    setError('');

    try {
      let newUrl: string;
      let promptUsed: string;

      if (runMode === 'redo') {
        // TOTAL REDO — call /api/generate-image with the composed prompt
        // as the entire instruction. Source image is NOT sent. Output is
        // a fresh design, not a modification.
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: composedPrompt,
            apiKey: openAIKey,
            size: '1024x1024',
            model: 'openai',
            quality: 'medium',
            folder: 'redone',
            filename: `${conceptId || 'standalone'}-${label}-redo-${Date.now()}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Redo failed');
          return;
        }
        newUrl = data.imageUrl;
        promptUsed = composedPrompt;
      } else {
        // SMALL EDIT — current behavior. /api/edit-image with the source
        // image + the user's adjustment.
        const res = await fetch('/api/edit-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageUrl: sourceUrl,
            editPrompt: composedPrompt,
            apiKey: openAIKey,
            strength,
            preserveComposition,
            preserveSubject,
            folder: 'edited',
            filename: `${conceptId || 'standalone'}-${label}-${Date.now()}`,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || 'Edit failed');
          return;
        }
        newUrl = data.url;
        promptUsed = data.prompt || composedPrompt;
      }

      const newAttempt: EditAttempt = {
        id: `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url: newUrl,
        kind: runMode,
        promptSentToOpenAI: promptUsed,
        composedPromptText: composedPromptText || '(no description)',
        basedOnLabel: runMode === 'redo' ? 'New generation' : sourceLabel,
        strength,
        preserveComposition,
        preserveSubject,
        createdAt: Date.now(),
      };
      setAttempts((prev) => {
        const next = [...prev, newAttempt];
        setActiveIdx(next.length - 1);
        setSourceIdx(next.length - 1);
        return next;
      });
    } catch {
      setError('Network error — please try again.');
    } finally {
      setEditing(false);
    }
  };

  // ---------- accept ----------
  const accept = () => {
    if (!activeAttempt) return;
    onEdited({ url: activeAttempt.url });
    toast(`${label.charAt(0).toUpperCase() + label.slice(1)} updated`, 'success');
    onClose();
  };

  // ---------- discard a single attempt ----------
  const discardAttempt = (idx: number) => {
    setAttempts((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      // Re-point active and source to safe values
      setActiveIdx((cur) => {
        if (cur === null) return null;
        if (cur === idx) return next.length > 0 ? next.length - 1 : null;
        if (cur > idx) return cur - 1;
        return cur;
      });
      setSourceIdx((cur) => {
        if (cur === null) return null;
        if (cur === idx) return null; // fall back to Original
        if (cur > idx) return cur - 1;
        return cur;
      });
      return next;
    });
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-image-title"
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-4xl max-h-[96vh] sm:max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 id="edit-image-title" className="text-base font-semibold">
              Edit {label.charAt(0).toUpperCase() + label.slice(1)} Image
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Every edit is preserved. Iterate as many times as you want, branch off any version, and accept whichever you like best.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="p-3 sm:p-5 space-y-4">
          {/* Original (always pinned) + Active attempt preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1 flex items-center justify-between">
                <span>Original</span>
                <span className="text-[10px] text-muted normal-case tracking-normal italic">always preserved</span>
              </div>
              <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border overflow-hidden">
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt="Original" className="w-full h-full object-contain" />
                ) : null}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted mb-1 flex items-center justify-between">
                <span>
                  {activeAttempt ? `Active — Attempt ${activeIdx! + 1}` : 'Preview appears here'}
                </span>
                {activeAttempt && (
                  <span className="text-[10px] text-muted normal-case tracking-normal italic">
                    based on {activeAttempt.basedOnLabel}
                  </span>
                )}
              </div>
              <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border overflow-hidden flex items-center justify-center">
                {editing ? (
                  <div className="flex flex-col items-center gap-2 text-muted">
                    <span className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs">Applying edit…</span>
                  </div>
                ) : activeAttempt ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={activeAttempt.url} alt={`Attempt ${activeIdx! + 1}`} className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-muted">No edits yet — Apply Edit below to start iterating.</span>
                )}
              </div>
            </div>
          </div>

          {/* Attempts strip */}
          {attempts.length > 0 && (
            <div className="bg-background border border-border rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold">
                  Edit history — {attempts.length} attempt{attempts.length !== 1 ? 's' : ''}
                </span>
                <span className="text-[10px] text-muted italic">click to view · branch icon to edit from that version</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {/* Original thumbnail (pinned, can be source) */}
                <div className="shrink-0 w-32">
                  <div
                    className={`aspect-square rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                      sourceIdx === null
                        ? 'border-purple-500 ring-2 ring-purple-200'
                        : 'border-border hover:border-purple-300'
                    }`}
                    onClick={() => setSourceIdx(null)}
                    title="Branch the next edit from the original"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imageUrl} alt="Original" className="w-full h-full object-cover bg-background" />
                  </div>
                  <div className="text-[10px] mt-1 font-medium">Original</div>
                  {sourceIdx === null && (
                    <div className="text-[9px] text-purple-700 font-semibold">↳ NEXT EDIT FROM HERE</div>
                  )}
                </div>

                {attempts.map((a, i) => (
                  <div key={a.id} className="shrink-0 w-32">
                    <div
                      className={`relative aspect-square rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
                        activeIdx === i
                          ? 'border-accent ring-2 ring-accent/30'
                          : 'border-border hover:border-accent/60'
                      } ${sourceIdx === i ? 'outline outline-2 outline-purple-500 outline-offset-1' : ''}`}
                      onClick={() => setActiveIdx(i)}
                      title={`View ${a.kind === 'redo' ? 'Redo' : 'Edit'} ${i + 1}: ${a.composedPromptText}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt={`Attempt ${i + 1}`} className="w-full h-full object-cover bg-background" />
                      <span
                        className={`absolute top-1 left-1 text-[8px] px-1 rounded font-bold ${
                          a.kind === 'redo' ? 'bg-orange-500 text-white' : 'bg-accent text-white'
                        }`}
                      >
                        {a.kind === 'redo' ? 'REDO' : 'EDIT'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1 gap-1">
                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-medium truncate">Attempt {i + 1}</div>
                        <div className="text-[9px] text-muted truncate" title={a.composedPromptText}>
                          {a.composedPromptText}
                        </div>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); setSourceIdx(i); }}
                          className={`text-[10px] px-1 rounded transition-colors ${
                            sourceIdx === i
                              ? 'bg-purple-600 text-white'
                              : 'text-muted hover:text-purple-700'
                          }`}
                          title="Branch — make the next edit start from this attempt"
                        >
                          ⎇
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); discardAttempt(i); }}
                          className="text-[10px] px-1 text-muted hover:text-red-600"
                          title="Discard this attempt"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    {sourceIdx === i && (
                      <div className="text-[9px] text-purple-700 font-semibold mt-0.5">↳ NEXT EDIT FROM HERE</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Branch source indicator (always visible so user knows what next edit modifies) */}
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-2.5 text-xs flex items-center justify-between gap-2">
            <span className="text-purple-900">
              Next edit will modify: <strong>{sourceLabel}</strong>
              {sourceIdx !== null && attempts[sourceIdx] && (
                <span className="text-purple-700 italic">
                  {' '}({attempts[sourceIdx].composedPromptText})
                </span>
              )}
            </span>
            {sourceIdx !== null && (
              <button
                onClick={() => setSourceIdx(null)}
                className="text-[11px] text-purple-700 hover:text-purple-900 underline"
              >
                reset to original
              </button>
            )}
          </div>

          {/* AI-suggested edits */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div className="text-xs font-medium flex items-center gap-1.5">
                <span>✦ AI suggestions</span>
                <span className="text-[10px] text-muted font-normal">
                  (analyzes the {sourceLabel.toLowerCase()})
                </span>
              </div>
              <button
                type="button"
                onClick={fetchSuggestions}
                disabled={suggesting}
                className="text-[11px] px-2 py-0.5 border border-border rounded hover:bg-surface-hover text-muted hover:text-foreground disabled:opacity-50 transition-colors"
              >
                {suggesting ? 'Analyzing…' : aiSuggestions.length > 0 ? 'Refresh' : 'Get suggestions'}
              </button>
            </div>
            {aiSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {aiSuggestions.map((c) => (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => toggleChip(c.label)}
                    title={c.prompt}
                    className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                      selectedChips.has(c.label)
                        ? 'bg-purple-600 text-white border-purple-600'
                        : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
                    }`}
                  >
                    ✦ {c.label}
                  </button>
                ))}
              </div>
            )}
            {aiSuggestions.length === 0 && !suggesting && (
              <p className="text-[11px] text-muted italic">
                Click &quot;Get suggestions&quot; to have AI analyze the source image and recommend specific fixes.
              </p>
            )}
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
              {runMode === 'redo' ? 'Describe the new design' : 'Custom adjustment'}{' '}
              <span className="text-muted font-normal">{runMode === 'redo' ? '(required)' : '(optional)'}</span>
            </label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder={runMode === 'redo'
                ? 'e.g. "Bold geometric mandala with thick black lines on white background"'
                : 'e.g. "remove the outer border", "make the eyes larger", "add a subtle stipple texture to the mountain"'}
              rows={2}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
            />
          </div>

          {/* MODE: Small Edit vs Total Redo */}
          <div>
            <label className="block text-xs font-medium mb-1.5">Iteration mode</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRunMode('edit')}
                className={`text-left p-2.5 border-2 rounded-lg transition-colors ${
                  runMode === 'edit'
                    ? 'bg-accent/10 border-accent'
                    : 'bg-background border-border hover:border-accent/40'
                }`}
              >
                <div className="text-sm font-semibold">✎ Small edit</div>
                <div className="text-[10px] text-muted leading-tight">
                  Modify the existing image. Preserves composition, applies your tweak.
                </div>
              </button>
              <button
                type="button"
                onClick={() => setRunMode('redo')}
                className={`text-left p-2.5 border-2 rounded-lg transition-colors ${
                  runMode === 'redo'
                    ? 'bg-orange-500/10 border-orange-500'
                    : 'bg-background border-border hover:border-orange-300'
                }`}
              >
                <div className="text-sm font-semibold">✦ Total redo</div>
                <div className="text-[10px] text-muted leading-tight">
                  Generate a brand new image from your description. Composition is NOT preserved.
                </div>
              </button>
            </div>
          </div>

          {/* Strength + Preserve toggles (only relevant for Small Edit mode) + Apply.
              Stacks on mobile, 3-col on tablet+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <div className={`text-xs font-medium mb-1.5 ${runMode === 'redo' ? 'text-muted' : ''}`}>
                Strength {runMode === 'redo' && <span className="text-[10px] font-normal italic">(edit only)</span>}
              </div>
              <div className={`flex gap-1 bg-background border border-border rounded-lg p-0.5 ${runMode === 'redo' ? 'opacity-50' : ''}`}>
                {(['subtle', 'medium', 'major'] as Strength[]).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStrength(s)}
                    disabled={runMode === 'redo'}
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
              <div className={`text-xs font-medium mb-1.5 ${runMode === 'redo' ? 'text-muted' : ''}`}>
                Preserve {runMode === 'redo' && <span className="text-[10px] font-normal italic">(edit only)</span>}
              </div>
              <div className={`space-y-1 ${runMode === 'redo' ? 'opacity-50' : ''}`}>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={preserveComposition}
                    onChange={(e) => setPreserveComposition(e.target.checked)}
                    disabled={runMode === 'redo'}
                    className="accent-accent"
                  />
                  Composition
                </label>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={preserveSubject}
                    onChange={(e) => setPreserveSubject(e.target.checked)}
                    disabled={runMode === 'redo'}
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
                className={`w-full py-2 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                  runMode === 'redo'
                    ? 'bg-orange-600 hover:bg-orange-700'
                    : 'bg-accent hover:bg-accent-hover'
                }`}
              >
                {editing
                  ? (runMode === 'redo' ? 'Generating…' : 'Editing…')
                  : runMode === 'redo' ? '✦ Total Redo → New Attempt' : '✎ Apply Edit → New Attempt'}
              </button>
              <p className="text-[10px] text-muted mt-1 text-center italic">adds to history, never replaces</p>
            </div>
          </div>

          {error && (
            <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
          )}

          {/* Active attempt details — full prompt the API got */}
          {activeAttempt && (
            <details className="text-xs">
              <summary className="cursor-pointer text-muted hover:text-foreground">
                View prompt used for Attempt {activeIdx! + 1}
              </summary>
              <pre className="mt-1.5 p-2 bg-background border border-border rounded text-[10px] text-muted whitespace-pre-wrap">
                {activeAttempt.promptSentToOpenAI}
              </pre>
            </details>
          )}

          {/* Accept the active attempt */}
          {activeAttempt && !editing && (
            <div className="flex gap-2 pt-3 border-t border-border">
              <button
                onClick={accept}
                className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                ✓ Use Attempt {activeIdx! + 1}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2.5 bg-background border border-border hover:bg-surface-hover rounded-lg text-sm font-medium transition-colors"
              >
                Close (keep original)
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
