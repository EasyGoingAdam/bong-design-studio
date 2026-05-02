'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept } from '@/lib/types';
import { useToast } from './toast';
import { ImageDownloadButtons } from './image-download';

type Angle = 'front' | 'three_quarter_left' | 'three_quarter_right' | 'side' | 'back' | 'top';
type EtchStyle = 'frosted' | 'deep' | 'shallow' | 'filled_black';
type Placement = 'auto' | 'wrap' | 'front_panel' | 'band_top' | 'band_bottom';
type Background = 'keep' | 'white_studio' | 'gradient' | 'lifestyle';

interface Review {
  photorealismScore: number;
  applicationScore: number;
  issues: string[];
  strengths: string[];
  autoFixInstruction: string;
}

const ANGLES: { id: Angle; label: string }[] = [
  { id: 'front', label: 'Front' },
  { id: 'three_quarter_left', label: '¾ Left' },
  { id: 'three_quarter_right', label: '¾ Right' },
  { id: 'side', label: 'Side' },
  { id: 'back', label: 'Back' },
  { id: 'top', label: 'Top-down' },
];

const ETCH_STYLES: { id: EtchStyle; label: string; desc: string }[] = [
  { id: 'frosted', label: 'Frosted', desc: 'Classic laser frost — slightly opaque white' },
  { id: 'deep', label: 'Deep etch', desc: 'High-contrast opaque white, max visibility' },
  { id: 'shallow', label: 'Shallow', desc: 'Subtle, reads only in reflected light' },
  { id: 'filled_black', label: 'Black infill', desc: 'Solid black pigment in the etch' },
];

const PLACEMENTS: { id: Placement; label: string; desc: string }[] = [
  { id: 'auto', label: 'Auto', desc: 'Model picks the best spot' },
  { id: 'wrap', label: 'Wrap', desc: 'Design wraps the full cylinder' },
  { id: 'front_panel', label: 'Front panel', desc: 'Single front-facing panel only' },
  { id: 'band_top', label: 'Top band', desc: 'Horizontal band upper third' },
  { id: 'band_bottom', label: 'Bottom band', desc: 'Horizontal band lower third' },
];

const BACKGROUNDS: { id: Background; label: string }[] = [
  { id: 'keep', label: 'Keep original' },
  { id: 'white_studio', label: 'White studio' },
  { id: 'gradient', label: 'Soft gradient' },
  { id: 'lifestyle', label: 'Lifestyle' },
];

const QUICK_EDITS: { label: string; instruction: string }[] = [
  { label: 'Tighten etching', instruction: 'Increase the sharpness and contrast of the etched design so every line reads clearly.' },
  { label: 'Softer etching', instruction: 'Reduce the intensity and opacity of the etched design so it feels more delicate.' },
  { label: 'Fix alignment', instruction: 'Center the etched design more precisely on the product and straighten any rotation.' },
  { label: 'Brighter lighting', instruction: 'Brighten the overall lighting and add a subtle rim light on the product edges.' },
  { label: 'Cleaner background', instruction: 'Clean up background artifacts and make the backdrop smoother and more even.' },
  { label: 'Sharper glass', instruction: 'Make the glass material feel sharper, with clearer refractions and crisper specular highlights.' },
  { label: 'Follow curvature', instruction: 'Make the etched design follow the glass curvature more naturally, especially near the edges.' },
  { label: 'Reduce opacity', instruction: 'Reduce etch opacity so the glass transparency reads through behind it.' },
];

interface Props {
  concept: Concept;
  onClose: () => void;
}

/**
 * Full-featured product-mockup composer. Uploads a blank product, renders
 * the design onto it via gpt-image-1 multi-image edits, auto-reviews the
 * output with GPT-4o-mini vision, and lets the user iterate with quick-edit
 * chips + free text + auto-fix.
 */
export function MockupComposer({ concept, onClose }: Props) {
  const { openAIKey, updateConcept } = useAppStore();
  const { toast } = useToast();

  const [blankProduct, setBlankProduct] = useState(concept.blankProductUrl || '');
  const [angle, setAngle] = useState<Angle>('three_quarter_right');
  const [etchStyle, setEtchStyle] = useState<EtchStyle>('frosted');
  const [placement, setPlacement] = useState<Placement>('auto');
  const [background, setBackground] = useState<Background>('keep');
  const [size, setSize] = useState('1024x1024');
  const [includeBase, setIncludeBase] = useState(!!concept.baseImageUrl);
  const [editInstruction, setEditInstruction] = useState('');
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());

  const [rendering, setRendering] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [result, setResult] = useState(concept.productMockupUrl || '');
  const [review, setReview] = useState<Review | null>(null);
  const [error, setError] = useState('');
  // Array of {angle, url} from this session
  const [angleVariants, setAngleVariants] = useState<{ angle: Angle; url: string }[]>(
    concept.productMockupAngles?.map((a) => ({ angle: a.angle as Angle, url: a.url })) || []
  );
  const [multiAngleRunning, setMultiAngleRunning] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onBlankUploaded = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setBlankProduct(reader.result);
    };
    reader.onerror = () => toast('Failed to read file', 'error');
    reader.readAsDataURL(file);
  };

  const toggleChip = (label: string) => {
    setSelectedChips((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const composeInstruction = (extra?: string): string => {
    const chipInstructions = Array.from(selectedChips)
      .map((l) => QUICK_EDITS.find((q) => q.label === l)?.instruction || '')
      .filter(Boolean);
    return [...chipInstructions, editInstruction.trim(), extra?.trim() || ''].filter(Boolean).join(' ');
  };

  const render = async (overrideInstruction?: string, overrideAngle?: Angle) => {
    if (!blankProduct) {
      setError('Upload a blank product photo first.');
      return;
    }
    if (!concept.coilImageUrl) {
      setError('This concept needs a generated coil design first.');
      return;
    }
    if (!openAIKey) {
      setError('Set your OpenAI API key in Settings first.');
      return;
    }

    setRendering(true);
    setError('');
    setReview(null);
    try {
      const res = await fetch('/api/mockup-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blankProductUrl: blankProduct,
          coilDesignUrl: concept.coilImageUrl,
          baseDesignUrl: includeBase && concept.baseImageUrl ? concept.baseImageUrl : undefined,
          apiKey: openAIKey,
          angle: overrideAngle || angle,
          etchStyle,
          placement,
          background,
          size,
          editInstruction: overrideInstruction ?? composeInstruction(),
          folder: 'mockups',
          filename: concept.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Render failed');
        return;
      }
      setResult(data.url);
      // Kick off auto-review — users want critique on every render
      reviewMockup(data.url);
      return data.url as string;
    } catch {
      setError('Network error — please try again.');
    } finally {
      setRendering(false);
    }
  };

  const reviewMockup = async (urlToReview: string) => {
    if (!urlToReview || urlToReview.startsWith('data:')) return;
    if (!openAIKey) return;
    setReviewing(true);
    try {
      const res = await fetch('/api/review-mockup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mockupUrl: urlToReview, apiKey: openAIKey }),
      });
      const data = await res.json();
      if (res.ok) setReview(data);
    } catch {
      // Non-fatal — review is a "nice to have"
    } finally {
      setReviewing(false);
    }
  };

  const autoFix = async () => {
    if (!review?.autoFixInstruction) return;
    // Re-render with the auto-fix instruction injected
    await render(composeInstruction(review.autoFixInstruction));
  };

  const renderAllAngles = async () => {
    if (!blankProduct || !concept.coilImageUrl || !openAIKey) {
      toast('Need a blank product, a coil design, and an API key', 'error');
      return;
    }
    setMultiAngleRunning(true);
    setError('');
    const anglesToRun: Angle[] = ['front', 'three_quarter_right', 'side', 'back'];
    const sharedBody = {
      blankProductUrl: blankProduct,
      coilDesignUrl: concept.coilImageUrl,
      baseDesignUrl: includeBase && concept.baseImageUrl ? concept.baseImageUrl : undefined,
      apiKey: openAIKey,
      etchStyle,
      placement,
      background,
      size,
      editInstruction: composeInstruction(),
      folder: 'mockups',
      filename: concept.name,
    };

    try {
      // Run all 4 angles in parallel — was sequential, taking 4× the
      // wall-clock time. OpenAI's image-edits endpoint accepts
      // concurrent requests fine, so 4 angles now finish in roughly the
      // time of 1.
      const results = await Promise.all(
        anglesToRun.map(async (a) => {
          try {
            const res = await fetch('/api/mockup-product', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...sharedBody, angle: a }),
            });
            const data = await res.json();
            if (res.ok) return { angle: a, url: data.url as string, ok: true as const };
            return { angle: a, url: '', ok: false as const, error: (data.error as string) || 'unknown' };
          } catch {
            return { angle: a, url: '', ok: false as const, error: 'Network error' };
          }
        }),
      );

      const collected = results.filter((r) => r.ok).map((r) => ({ angle: r.angle, url: r.url }));
      setAngleVariants([...collected]);

      const failed = results.filter((r) => !r.ok);
      failed.forEach((f) => toast(`Angle "${f.angle}" failed: ${f.error}`, 'error'));

      toast(`Rendered ${collected.length} of ${anglesToRun.length} angles`, collected.length === anglesToRun.length ? 'success' : 'info');
    } finally {
      setMultiAngleRunning(false);
    }
  };

  const saveAll = () => {
    updateConcept(concept.id, {
      blankProductUrl: blankProduct,
      productMockupUrl: result,
      productMockupAngles: angleVariants,
    });
    toast('Mockups saved to concept', 'success');
    onClose();
  };

  const canRender = !!blankProduct && !!concept.coilImageUrl && !!openAIKey && !rendering;

  const scoreColor = (n: number) =>
    n >= 8 ? 'text-green-700 bg-green-100 border-green-300'
    : n >= 5 ? 'text-amber-700 bg-amber-100 border-amber-300'
    : 'text-red-700 bg-red-100 border-red-300';

  return (
    <div
      className="fixed inset-0 bg-black/70 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-7xl max-h-[95vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold">Product Mockup Studio</h2>
            <p className="text-xs text-muted mt-0.5">
              Upload a blank unit, pick options, and OpenAI gpt-image-1 renders the etched design onto the product. Every render is auto-critiqued and can be auto-fixed.
            </p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
          {/* Left: controls */}
          <div className="lg:col-span-4 p-5 space-y-4 border-r border-border">

            {/* Blank product upload */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Blank product photo</label>
              {blankProduct ? (
                <div className="relative group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={blankProduct}
                    alt="Blank product"
                    className="w-full rounded-lg border border-border object-contain bg-background"
                    style={{ maxHeight: 200 }}
                  />
                  <label className="absolute bottom-2 right-2 text-[11px] bg-background/90 border border-border rounded px-2 py-1 cursor-pointer hover:bg-background">
                    Replace
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => e.target.files?.[0] && onBlankUploaded(e.target.files[0])}
                    />
                  </label>
                </div>
              ) : (
                <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors">
                  <div className="text-xs text-muted">Upload a photo of the blank (un-etched) product</div>
                  <div className="text-[10px] text-muted mt-1">Best results: clean background, product centered</div>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && onBlankUploaded(e.target.files[0])}
                  />
                </label>
              )}
            </div>

            {/* Design inputs preview */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Design assets being applied</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-muted mb-0.5">Coil</div>
                  <div className="aspect-square bg-background border border-border rounded overflow-hidden">
                    {concept.coilImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={concept.coilImageUrl} alt="Coil" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-red-700 text-center p-2">No coil design yet — generate one first</div>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted mb-0.5 flex items-center justify-between">
                    <span>Base</span>
                    <label className="text-[10px] flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={includeBase}
                        onChange={(e) => setIncludeBase(e.target.checked)}
                        disabled={!concept.baseImageUrl}
                        className="accent-accent"
                      />
                      Include
                    </label>
                  </div>
                  <div className={`aspect-square bg-background border border-border rounded overflow-hidden ${!includeBase ? 'opacity-40' : ''}`}>
                    {concept.baseImageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={concept.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] text-muted">No base</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Angle */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Camera angle</label>
              <div className="grid grid-cols-3 gap-1">
                {ANGLES.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAngle(a.id)}
                    className={`text-[11px] py-1.5 rounded border transition-colors ${
                      angle === a.id
                        ? 'bg-accent text-white border-accent'
                        : 'bg-background border-border text-muted hover:text-foreground'
                    }`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Etching style */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Etching style</label>
              <div className="grid grid-cols-2 gap-1.5">
                {ETCH_STYLES.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setEtchStyle(s.id)}
                    className={`text-left px-2 py-1.5 rounded border transition-colors ${
                      etchStyle === s.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-background border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="text-xs font-medium">{s.label}</div>
                    <div className="text-[10px] text-muted leading-tight">{s.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Placement */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Design placement</label>
              <div className="grid grid-cols-2 gap-1.5">
                {PLACEMENTS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlacement(p.id)}
                    className={`text-left px-2 py-1.5 rounded border transition-colors ${
                      placement === p.id
                        ? 'bg-accent/10 border-accent'
                        : 'bg-background border-border hover:border-accent/40'
                    }`}
                  >
                    <div className="text-xs font-medium">{p.label}</div>
                    <div className="text-[10px] text-muted leading-tight">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Background + size */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1.5">Background</label>
                <select
                  value={background}
                  onChange={(e) => setBackground(e.target.value as Background)}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                >
                  {BACKGROUNDS.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5">Output size</label>
                <select
                  value={size}
                  onChange={(e) => setSize(e.target.value)}
                  className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                >
                  <option value="1024x1024">Square (1024²)</option>
                  <option value="1024x1536">Portrait (1024×1536)</option>
                  <option value="1536x1024">Landscape (1536×1024)</option>
                </select>
              </div>
            </div>

            {/* Quick edit chips */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Quick edits</label>
              <div className="flex flex-wrap gap-1">
                {QUICK_EDITS.map((q) => (
                  <button
                    key={q.label}
                    onClick={() => toggleChip(q.label)}
                    title={q.instruction}
                    className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
                      selectedChips.has(q.label)
                        ? 'bg-accent text-white border-accent'
                        : 'bg-background border-border text-muted hover:text-foreground'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Free text */}
            <div>
              <label className="block text-xs font-medium mb-1.5">
                Custom adjustment <span className="text-muted font-normal">(optional)</span>
              </label>
              <textarea
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                placeholder='e.g. "make the neck slightly longer", "add a subtle wooden surface under the product"'
                rows={2}
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
              />
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                onClick={() => render()}
                disabled={!canRender}
                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {rendering ? 'Rendering with gpt-image-1…' : result ? '✦ Re-render' : '✦ Generate Mockup'}
              </button>
              <button
                onClick={renderAllAngles}
                disabled={!canRender || multiAngleRunning}
                className="w-full py-2 bg-surface border border-border hover:bg-surface-hover rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                title="Generate front, ¾ right, side, and back views in sequence"
              >
                {multiAngleRunning ? `Rendering angle ${angleVariants.length + 1} of 4…` : '🎥 Render all 4 angles'}
              </button>
            </div>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">{error}</div>
            )}
          </div>

          {/* Right: preview + review */}
          <div className="lg:col-span-8 p-5 bg-background">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* Main preview */}
              <div className="xl:col-span-2">
                <div className="text-xs text-muted uppercase tracking-wider mb-2">Rendered mockup</div>
                <div className="aspect-square rounded-xl border border-border overflow-hidden bg-surface flex items-center justify-center">
                  {rendering ? (
                    <div className="flex flex-col items-center gap-3 text-muted p-8">
                      <span className="w-10 h-10 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-sm">Compositing blank + coil + base via gpt-image-1…</span>
                      <span className="text-[10px]">This takes 15–40 seconds</span>
                    </div>
                  ) : result ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={result} alt="Mockup" className="w-full h-full object-contain" />
                  ) : (
                    <div className="text-center text-xs text-muted p-6">
                      Configure options on the left and click <b>Generate Mockup</b>.
                    </div>
                  )}
                </div>

                {result && !rendering && (
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={saveAll}
                      className="flex-1 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
                    >
                      ✓ Save to concept
                    </button>
                    <ImageDownloadButtons imageUrl={result} filename={`${concept.name}-mockup-${angle}`} />
                  </div>
                )}
              </div>

              {/* Review sidebar */}
              <div className="space-y-3">
                <div className="text-xs text-muted uppercase tracking-wider mb-2">AI Review</div>
                {reviewing ? (
                  <div className="bg-surface border border-border rounded-lg p-3 text-xs text-muted">
                    <span className="inline-block w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin mr-2 align-middle" />
                    Analyzing mockup with GPT-4o…
                  </div>
                ) : review ? (
                  <div className="bg-surface border border-border rounded-lg p-3 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className={`border rounded p-2 text-center ${scoreColor(review.photorealismScore)}`}>
                        <div className="text-[9px] uppercase tracking-wider opacity-80">Realism</div>
                        <div className="text-xl font-bold">{review.photorealismScore}<span className="text-xs opacity-60">/10</span></div>
                      </div>
                      <div className={`border rounded p-2 text-center ${scoreColor(review.applicationScore)}`}>
                        <div className="text-[9px] uppercase tracking-wider opacity-80">Application</div>
                        <div className="text-xl font-bold">{review.applicationScore}<span className="text-xs opacity-60">/10</span></div>
                      </div>
                    </div>

                    {review.strengths.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-green-700 mb-1">✓ Strengths</div>
                        <ul className="space-y-0.5 pl-3 text-[11px] text-muted">
                          {review.strengths.map((s, i) => (
                            <li key={i} className="list-disc leading-snug">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {review.issues.length > 0 && (
                      <div>
                        <div className="text-[10px] font-semibold text-red-700 mb-1">⚠ Issues</div>
                        <ul className="space-y-0.5 pl-3 text-[11px] text-muted">
                          {review.issues.map((s, i) => (
                            <li key={i} className="list-disc leading-snug">{s}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {review.autoFixInstruction && (
                      <div className="pt-2 border-t border-border">
                        <div className="text-[10px] font-semibold text-accent mb-1">AI-suggested fix</div>
                        <p className="text-[11px] text-muted italic leading-snug">&ldquo;{review.autoFixInstruction}&rdquo;</p>
                        <button
                          onClick={autoFix}
                          disabled={rendering}
                          className="mt-2 w-full text-xs py-1.5 bg-accent hover:bg-accent-hover text-white rounded transition-colors disabled:opacity-50"
                        >
                          {rendering ? 'Fixing…' : '✦ Auto-fix & re-render'}
                        </button>
                      </div>
                    )}
                  </div>
                ) : result ? (
                  <div className="bg-surface border border-border rounded-lg p-3 text-xs text-muted">
                    <button
                      onClick={() => reviewMockup(result)}
                      className="w-full py-1.5 bg-background border border-border hover:bg-surface-hover rounded text-xs transition-colors"
                    >
                      ✦ Review this mockup
                    </button>
                  </div>
                ) : (
                  <div className="bg-surface border border-border rounded-lg p-3 text-[11px] text-muted italic">
                    After you render, GPT-4o will grade the mockup for photorealism and design-application quality, and suggest a one-sentence fix.
                  </div>
                )}
              </div>
            </div>

            {/* Angle variants strip */}
            {angleVariants.length > 0 && (
              <div className="mt-5">
                <div className="text-xs text-muted uppercase tracking-wider mb-2">Angle variants ({angleVariants.length})</div>
                <div className="grid grid-cols-4 gap-2">
                  {angleVariants.map((v) => (
                    <button
                      key={v.angle + v.url}
                      onClick={() => { setResult(v.url); setAngle(v.angle); reviewMockup(v.url); }}
                      className="aspect-square rounded-lg border border-border overflow-hidden hover:border-accent transition-colors bg-surface"
                      title={`Switch main preview to ${v.angle}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={v.url} alt={v.angle} className="w-full h-full object-contain" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
