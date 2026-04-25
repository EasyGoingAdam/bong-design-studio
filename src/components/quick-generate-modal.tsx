'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept, GenerationMode, CoilBaseRelationship } from '@/lib/types';
import { Select, TextArea, SliderInput } from './ui';
import { buildCoilPrompt, buildBasePrompt } from '@/lib/prompt-builder';
import { ImageDownloadButtons } from './image-download';
import { useToast } from './toast';
import { EditImageModal } from './edit-image-modal';

const MODE_OPTIONS = [
  { value: 'production_bw', label: 'Production Ready' },
  { value: 'concept_art', label: 'Concept Exploration' },
  { value: 'pattern_wrap', label: 'Pattern / Wrap' },
  { value: 'premium_luxury', label: 'Premium / Luxury' },
  { value: 'seasonal_drop', label: 'Seasonal Drop' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'exact_match', label: 'Exact Match' },
  { value: 'mirror', label: 'Mirrored' },
  { value: 'thematic', label: 'Thematic' },
  { value: 'complementary', label: 'Complementary' },
  { value: 'continuation', label: 'Continuation / Flow' },
  { value: 'contrast', label: 'Contrast' },
  { value: 'loose', label: 'Loosely Coordinated' },
  { value: 'independent', label: 'Independent / Standalone' },
];

export function QuickGenerateModal({ concept, onClose }: { concept: Concept; onClose: () => void }) {
  const { openAIKey, geminiKey, updateConcept, addAIGeneration, addVersion } = useAppStore();
  const { toast } = useToast();

  // Pre-fill from concept specs
  const [mode, setMode] = useState<GenerationMode>('production_bw');
  const [relationship, setRelationship] = useState<CoilBaseRelationship>(concept.specs.coordinationMode || 'thematic');
  const [complexity, setComplexity] = useState<number>(concept.specs.laserComplexity || 3);
  const [contrast, setContrast] = useState('high');
  const [coilShape, setCoilShape] = useState<'square' | 'rectangle'>('rectangle');
  const [baseShape, setBaseShape] = useState<'circle' | 'oval' | 'square' | 'rectangle'>(concept.specs.baseShape || 'circle');
  const [aiModel, setAiModel] = useState<'openai' | 'openai_v2' | 'gemini'>('openai');
  const [coilInstructions, setCoilInstructions] = useState(concept.coilSpecs.notes || '');
  const [baseInstructions, setBaseInstructions] = useState(concept.baseSpecs.notes || '');
  const [extraNotes, setExtraNotes] = useState('');
  // Per-run coil-only override — defaults to concept's coilOnly flag but
  // the user can flip it inside this modal for a one-off decision.
  const [coilOnly, setCoilOnly] = useState<boolean>(!!concept.coilOnly);
  // Engraving Mode is ON by default — hardcodes the production rules into
  // the prompt. Turning it OFF lets you generate freer concept art (e.g.
  // for brainstorming) that won't be etch-ready. Visible toggle per audit.
  const [engravingMode, setEngravingMode] = useState<boolean>(mode === 'production_bw');

  // Dimensions — pre-fill from existing specs where possible, default to Freeze Pipe standards
  const [dimUnit, setDimUnit] = useState<'mm' | 'in'>('mm');
  const [overallWidth, setOverallWidth] = useState('');
  const [overallHeight, setOverallHeight] = useState('');
  const [coilWidth, setCoilWidth] = useState(concept.coilSpecs.dimensions?.split(/\s*x\s*/)?.[0]?.replace(/[^\d.]/g, '') || '120');
  const [coilHeight, setCoilHeight] = useState(concept.coilSpecs.dimensions?.split(/\s*x\s*/)?.[1]?.replace(/[^\d.]/g, '') || '45');
  const [baseWidth, setBaseWidth] = useState(concept.baseSpecs.dimensions?.split(/\s*x\s*/)?.[0]?.replace(/[^\d.]/g, '') || '65');
  const [baseHeight, setBaseHeight] = useState(concept.baseSpecs.dimensions?.split(/\s*x\s*/)?.[1]?.replace(/[^\d.]/g, '') || '65');

  const [generating, setGenerating] = useState(false);
  const [generatedCoilUrl, setGeneratedCoilUrl] = useState('');
  const [generatedBaseUrl, setGeneratedBaseUrl] = useState('');

  // Per-session version history. Same pattern as the AI Generate tab —
  // every generate / edit ADDS an entry, nothing is replaced. The active
  // URL is what's saved to the concept on accept, but every prior version
  // stays accessible via the thumbnail strip below the preview.
  type HistoryEntry = { url: string; label: string; kind: 'generated' | 'edited'; createdAt: number };
  const [coilHistory, setCoilHistory] = useState<HistoryEntry[]>(
    concept.coilImageUrl ? [{ url: concept.coilImageUrl, label: 'Existing', kind: 'generated', createdAt: 0 }] : []
  );
  const [baseHistory, setBaseHistory] = useState<HistoryEntry[]>(
    concept.baseImageUrl ? [{ url: concept.baseImageUrl, label: 'Existing', kind: 'generated', createdAt: 0 }] : []
  );

  const addCoilToHistory = (url: string, kind: 'generated' | 'edited' = 'generated') => {
    setCoilHistory((prev) => [
      { url, kind, label: `${kind === 'edited' ? 'Edit' : 'Gen'} ${prev.length + 1}`, createdAt: Date.now() },
      ...prev,
    ]);
  };
  const addBaseToHistory = (url: string, kind: 'generated' | 'edited' = 'generated') => {
    setBaseHistory((prev) => [
      { url, kind, label: `${kind === 'edited' ? 'Edit' : 'Gen'} ${prev.length + 1}`, createdAt: Date.now() },
      ...prev,
    ]);
  };

  // For inline editing of a generated image before saving
  const [editingImage, setEditingImage] = useState<{ part: 'coil' | 'base'; url: string } | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const hasExistingImages = !!(concept.coilImageUrl || concept.baseImageUrl);

  // Append dimension context to the per-part instructions so the prompt is
  // dimension-aware without needing a separate prompt builder field.
  //
  // ORIENTATION CORRECTION: when "Wide" coil shape is selected, surface
  // the dimensions in landscape order (larger value as width). The user
  // entered W=45 H=120 which read as portrait — that conflicted with the
  // wide canvas request and caused the AI to compose portrait designs
  // inside a landscape canvas. We respect the LARGER dimension as the
  // long axis of the wide coil and present it as such to the model.
  const coilDimNote = (() => {
    if (!coilWidth || !coilHeight) return '';
    const w = Number(coilWidth);
    const h = Number(coilHeight);
    if (coilShape === 'rectangle' && w < h) {
      return `Target print area: ${h}${dimUnit} wide x ${w}${dimUnit} tall (HORIZONTAL coil strip — width is the long axis). Design must read cleanly at this size.`;
    }
    return `Target print area ${coilWidth}x${coilHeight}${dimUnit} — design must read cleanly at this size.`;
  })();
  const baseDimNote =
    baseWidth && baseHeight
      ? `Target print area ${baseWidth}x${baseHeight}${dimUnit} — design must read cleanly at this size.`
      : '';
  const overallDimNote =
    overallWidth && overallHeight
      ? `Overall product dimensions: ${overallWidth}x${overallHeight}${dimUnit}.`
      : '';

  const inputs = useMemo(() => ({
    title: concept.name,
    stylePrompt: concept.specs.designStyleName || concept.tags.join(', '),
    themePrompt: concept.specs.designTheme || concept.description,
    references: [overallDimNote, extraNotes, engravingMode ? '' : 'Engraving mode disabled — freeform concept art OK.'].filter(Boolean).join(' '),
    constraints: concept.specs.riskNotes || '',
    complexityLevel: complexity,
    coilInstructions: [coilInstructions, coilDimNote].filter(Boolean).join(' '),
    baseInstructions: [baseInstructions, baseDimNote].filter(Boolean).join(' '),
    relationship,
    mode,
    patternDensity: concept.specs.patternDensity || 'medium',
    contrast,
    baseShape,
    coilShape,
  }), [concept, mode, relationship, complexity, contrast, coilInstructions, baseInstructions, extraNotes, baseShape, coilShape, coilDimNote, baseDimNote, overallDimNote, engravingMode]);

  const coilPrompt = useMemo(() => buildCoilPrompt(inputs), [inputs]);
  const basePrompt = useMemo(() => buildBasePrompt(inputs), [inputs]);

  const handleGenerate = async () => {
    if ((aiModel === 'openai' || aiModel === 'openai_v2') && !openAIKey) {
      setError('Please set your OpenAI API key in Settings first.');
      return;
    }
    if (aiModel === 'gemini' && !geminiKey) {
      setError('Please set your Gemini API key in Settings first.');
      return;
    }

    setGenerating(true);
    setError('');
    // Don't clear the active preview — keep showing the previous result
    // until the new one arrives, and keep all prior versions in history.
    setSaved(false);

    try {
      // Generate coil — and base too unless the user flipped on coil-only.
      const coilSize = coilShape === 'rectangle' ? '1536x1024' : '1024x1024';
      const baseSizeMap: Record<string, string> = { circle: '1024x1024', oval: '1536x1024', square: '1024x1024', rectangle: '1536x1024' };
      const baseSize = baseSizeMap[baseShape] || '1024x1024';

      const coilJob = fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: coilPrompt, apiKey: openAIKey, geminiKey, size: coilSize, model: aiModel, quality: 'medium', complexityLevel: concept.specs.laserComplexity }),
      });
      const baseJob = coilOnly
        ? Promise.resolve(null)
        : fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: basePrompt, apiKey: openAIKey, geminiKey, size: baseSize, model: aiModel, quality: 'medium', complexityLevel: concept.specs.laserComplexity }),
          });

      const [coilRes, baseRes] = await Promise.all([coilJob, baseJob]);

      const coilData = await coilRes.json();
      if (!coilRes.ok) throw new Error(coilData.error || 'Failed to generate coil image');
      setGeneratedCoilUrl(coilData.imageUrl);
      addCoilToHistory(coilData.imageUrl, 'generated');

      if (baseRes) {
        const baseData = await baseRes.json();
        if (!baseRes.ok) throw new Error(baseData.error || 'Failed to generate base image');
        setGeneratedBaseUrl(baseData.imageUrl);
        addBaseToHistory(baseData.imageUrl, 'generated');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = () => {
    // Update concept images — persist the coil-only flag too so the rest
    // of the app (concept-detail, mockup-studio, etc.) hides the base UI.
    updateConcept(concept.id, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: coilOnly ? '' : generatedBaseUrl,
      coilOnly,
    });

    // Save AI generation record — include the model used so archived
    // concepts can show which engine produced the output (Gemini /
    // ChatGPT Image / ChatGPT Image 2.0).
    const modelLabel =
      aiModel === 'gemini' ? 'gemini-2.5-flash-image'
      : aiModel === 'openai_v2' ? 'gpt-image-2'
      : 'gpt-image-1';
    addAIGeneration(concept.id, {
      prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
      coilPrompt,
      basePrompt,
      mode,
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      model: modelLabel,
      provider: aiModel,
    });

    // Save as new version
    addVersion(concept.id, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      prompt: coilPrompt,
      notes: hasExistingImages ? 'AI regenerated images' : 'AI generated initial images',
    });

    setSaved(true);
    toast('Images saved as new version', 'success');
  };

  const handleSaveAndClose = () => {
    if (!saved && (generatedCoilUrl || generatedBaseUrl)) {
      handleSave();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={() => {
      if ((generatedCoilUrl || generatedBaseUrl) && !saved) {
        if (window.confirm('You have unsaved generated images. Close anyway?')) onClose();
      } else {
        onClose();
      }
    }}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-3xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-surface border-b border-border px-6 py-4 rounded-t-xl z-10">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">
                {hasExistingImages ? 'Regenerate' : 'Generate'} Images — {concept.name}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {hasExistingImages
                  ? 'Generate new Coil + Base images to replace the current ones'
                  : 'Generate Coil + Base concept images using AI'}
              </p>
            </div>
            <button onClick={onClose} className="text-muted hover:text-foreground text-lg px-2">×</button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Current images (if any) */}
          {hasExistingImages && (
            <div className="bg-background border border-border rounded-lg p-3">
              <span className="text-xs text-muted block mb-2">Current Images</span>
              <div className="flex gap-3">
                <div className="w-20 h-20 rounded bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {concept.coilImageUrl ? (
                    <img src={concept.coilImageUrl} alt="Coil" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[8px] text-muted">No coil</span>
                  )}
                </div>
                <div className="w-20 h-20 rounded bg-surface placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {concept.baseImageUrl ? (
                    <img src={concept.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-[8px] text-muted">No base</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* AI Model — three options for A/B comparison.
              Order per user: ChatGPT Image → ChatGPT Image 2.0 → Gemini. */}
          <div>
            <label className="block text-xs text-muted mb-1">AI Model</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setAiModel('openai')}
                className={`py-1.5 px-2 text-xs rounded-lg border-2 transition-colors font-medium ${
                  aiModel === 'openai'
                    ? 'bg-accent/10 border-accent text-accent'
                    : 'bg-background border-border text-muted hover:text-foreground'
                }`}
              >
                ChatGPT Image
              </button>
              <button
                type="button"
                onClick={() => setAiModel('openai_v2')}
                className={`py-1.5 px-2 text-xs rounded-lg border-2 transition-colors font-medium ${
                  aiModel === 'openai_v2'
                    ? 'bg-purple-500/10 border-purple-500 text-purple-700'
                    : 'bg-background border-border text-muted hover:text-foreground'
                }`}
                title="Newest OpenAI image model with engraving-tuned prompt"
              >
                ChatGPT Image 2.0
              </button>
              <button
                type="button"
                onClick={() => setAiModel('gemini')}
                className={`py-1.5 px-2 text-xs rounded-lg border-2 transition-colors font-medium ${
                  aiModel === 'gemini'
                    ? 'bg-blue-500/10 border-blue-400 text-blue-600'
                    : 'bg-background border-border text-muted hover:text-foreground'
                }`}
              >
                Gemini
              </button>
            </div>
          </div>

          {/* Mode flags — coil-only + engraving mode */}
          <div>
            <label className="block text-xs font-medium mb-1.5">Generation options</label>
            <div className="grid grid-cols-2 gap-3">
            <label
              className={`flex items-start gap-2 p-2.5 border-2 rounded-lg cursor-pointer transition-colors ${
                coilOnly ? 'bg-accent/10 border-accent' : 'bg-background border-border hover:border-accent/40'
              }`}
            >
              <input
                type="checkbox"
                checked={coilOnly}
                onChange={(e) => setCoilOnly(e.target.checked)}
                className="mt-0.5 accent-accent"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold">Coil only</div>
                <div className="text-[10px] text-muted leading-snug">
                  Skip base generation. Use for designs without a base piece.
                </div>
              </div>
            </label>
            <label
              className={`flex items-start gap-2 p-2.5 border-2 rounded-lg cursor-pointer transition-colors ${
                engravingMode ? 'bg-emerald-50 border-emerald-400' : 'bg-background border-border hover:border-accent/40'
              }`}
            >
              <input
                type="checkbox"
                checked={engravingMode}
                onChange={(e) => setEngravingMode(e.target.checked)}
                className="mt-0.5 accent-emerald-600"
              />
              <div className="min-w-0">
                <div className="text-sm font-semibold">Engraving Mode</div>
                <div className="text-[10px] text-muted leading-snug">
                  Force pure B&amp;W, no gradients, production-ready output. Turn off for freeform concept art.
                </div>
              </div>
            </label>
            </div>
          </div>

          {/* Quick Settings */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Generation Mode</label>
              <Select value={mode} onChange={(v) => setMode(v as GenerationMode)} options={MODE_OPTIONS} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Coil/Base Relationship</label>
              <Select value={relationship} onChange={(v) => setRelationship(v as CoilBaseRelationship)} options={RELATIONSHIP_OPTIONS} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">Contrast</label>
              <Select
                value={contrast}
                onChange={setContrast}
                options={[
                  { value: 'low', label: 'Low' },
                  { value: 'medium', label: 'Medium' },
                  { value: 'high', label: 'High' },
                ]}
              />
            </div>
            <SliderInput value={complexity} onChange={setComplexity} label="Complexity" />
            <div>
              <label className="block text-xs text-muted mb-1">Coil Shape</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setCoilShape('rectangle')} className={`flex-1 py-1.5 text-[10px] rounded border transition-colors flex flex-col items-center gap-0.5 ${coilShape === 'rectangle' ? 'bg-accent/20 border-accent text-accent' : 'bg-background border-border text-muted'}`}>
                  <span className="w-7 h-4 border border-current rounded-sm" />
                  Wide
                </button>
                <button type="button" onClick={() => setCoilShape('square')} className={`flex-1 py-1.5 text-[10px] rounded border transition-colors flex flex-col items-center gap-0.5 ${coilShape === 'square' ? 'bg-accent/20 border-accent text-accent' : 'bg-background border-border text-muted'}`}>
                  <span className="w-4 h-4 border border-current rounded-sm" />
                  Square
                </button>
              </div>
              {coilShape === 'rectangle' && coilWidth && coilHeight && Number(coilWidth) < Number(coilHeight) && (
                <p className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-1 mt-1 leading-snug">
                  ⚠ Your coil dimensions read as portrait ({coilWidth}×{coilHeight}). For a Wide coil the AI will treat the LARGER value as the width axis. Swap them in the Dimensions section if you want the literal numbers respected.
                </p>
              )}
            </div>
          </div>

          {!coilOnly && (
            <div>
              <label className="block text-xs text-muted mb-1">Base Image Shape</label>
              <div className="flex gap-1">
                <button type="button" onClick={() => setBaseShape('circle')} className={`flex-1 py-1.5 text-[10px] rounded border transition-colors flex flex-col items-center gap-0.5 ${baseShape === 'circle' ? 'bg-accent/20 border-accent text-accent' : 'bg-background border-border text-muted'}`}>
                  <span className="w-4 h-4 border border-current rounded-full" />
                  Circle
                </button>
                <button type="button" onClick={() => setBaseShape('oval')} className={`flex-1 py-1.5 text-[10px] rounded border transition-colors flex flex-col items-center gap-0.5 ${baseShape === 'oval' ? 'bg-accent/20 border-accent text-accent' : 'bg-background border-border text-muted'}`}>
                  <span className="w-6 h-4 border border-current rounded-full" />
                  Oval
                </button>
                <button type="button" onClick={() => setBaseShape('square')} className={`flex-1 py-1.5 text-[10px] rounded border transition-colors flex flex-col items-center gap-0.5 ${baseShape === 'square' ? 'bg-accent/20 border-accent text-accent' : 'bg-background border-border text-muted'}`}>
                  <span className="w-4 h-4 border border-current rounded-sm" />
                  Square
                </button>
                <button type="button" onClick={() => setBaseShape('rectangle')} className={`flex-1 py-1.5 text-[10px] rounded border transition-colors flex flex-col items-center gap-0.5 ${baseShape === 'rectangle' ? 'bg-accent/20 border-accent text-accent' : 'bg-background border-border text-muted'}`}>
                  <span className="w-7 h-4 border border-current rounded-sm" />
                  Wide
                </button>
              </div>
            </div>
          )}

          {/* Dimensions */}
          <div className="bg-background/50 border border-border rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Design Dimensions</span>
              <div className="flex items-center gap-1">
                {(['mm', 'in'] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setDimUnit(u)}
                    className={`text-[10px] px-2 py-0.5 rounded transition-colors ${dimUnit === u ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <div className={`grid gap-3 ${coilOnly ? 'grid-cols-2' : 'grid-cols-3'}`}>
              <div>
                <div className="text-[10px] text-muted mb-1">Overall</div>
                <div className="flex gap-1">
                  <input type="number" step="0.1" value={overallWidth} onChange={(e) => setOverallWidth(e.target.value)} placeholder="W" className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-accent" />
                  <span className="text-[10px] text-muted self-center">×</span>
                  <input type="number" step="0.1" value={overallHeight} onChange={(e) => setOverallHeight(e.target.value)} placeholder="H" className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-accent" />
                </div>
              </div>
              <div>
                <div className="text-[10px] text-muted mb-1">Coil</div>
                <div className="flex gap-1">
                  <input type="number" step="0.1" value={coilWidth} onChange={(e) => setCoilWidth(e.target.value)} placeholder="W" className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-accent" />
                  <span className="text-[10px] text-muted self-center">×</span>
                  <input type="number" step="0.1" value={coilHeight} onChange={(e) => setCoilHeight(e.target.value)} placeholder="H" className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-accent" />
                </div>
              </div>
              {!coilOnly && (
                <div>
                  <div className="text-[10px] text-muted mb-1">Base</div>
                  <div className="flex gap-1">
                    <input type="number" step="0.1" value={baseWidth} onChange={(e) => setBaseWidth(e.target.value)} placeholder="W" className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-accent" />
                    <span className="text-[10px] text-muted self-center">×</span>
                    <input type="number" step="0.1" value={baseHeight} onChange={(e) => setBaseHeight(e.target.value)} placeholder="H" className="w-full bg-surface border border-border rounded px-1.5 py-1 text-xs focus:outline-none focus:border-accent" />
                  </div>
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted mt-2">
              Dimensions are passed into the prompt so the AI composes for the actual print area.
            </p>
          </div>

          <div className={`grid gap-3 ${coilOnly ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <div>
              <label className="block text-xs text-muted mb-1">Coil Instructions</label>
              <TextArea value={coilInstructions} onChange={setCoilInstructions} placeholder="Specific coil details..." rows={2} />
            </div>
            {!coilOnly && (
              <div>
                <label className="block text-xs text-muted mb-1">Base Instructions</label>
                <TextArea value={baseInstructions} onChange={setBaseInstructions} placeholder="Specific base details..." rows={2} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs text-muted mb-1">Additional Notes / Direction</label>
            <TextArea value={extraNotes} onChange={setExtraNotes} placeholder="Any extra creative direction..." rows={2} />
          </div>

          {/* Auto-detected context */}
          <div className="bg-background border border-border rounded-lg p-3 text-xs text-muted space-y-1">
            <div className="font-medium text-foreground text-[11px] uppercase tracking-wide mb-1">Auto-filled from concept</div>
            <div>Style: {concept.specs.designStyleName || concept.tags.join(', ') || 'Not set'}</div>
            <div>Theme: {concept.specs.designTheme || 'From description'}</div>
            <div>Density: {concept.specs.patternDensity} · Symmetry: {concept.specs.symmetryRequirement}</div>
            <div>Coil: {concept.coilSpecs.dimensions || 'Default'} · Base: {concept.baseSpecs.dimensions || 'Default'}</div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating Coil + Base...
              </span>
            ) : (
              `✦ ${hasExistingImages ? 'Regenerate' : 'Generate'} Coil + Base Images`
            )}
          </button>

          {/* Generated Output */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <div className="space-y-3">
              <div className="bg-background border border-border rounded-lg p-4">
                <span className="text-xs text-muted block mb-2">
                  Generated Images
                  {coilOnly && <span className="ml-2 text-[10px] text-accent">(coil only — base skipped)</span>}
                </span>
                <div className={`grid gap-4 ${coilOnly ? 'grid-cols-1 max-w-[50%] mx-auto' : 'grid-cols-2'}`}>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted">Coil</span>
                      {generatedCoilUrl && <ImageDownloadButtons imageUrl={generatedCoilUrl} filename={`${concept.name}-coil`} />}
                    </div>
                    <div className="aspect-square rounded-lg border border-border overflow-hidden bg-surface">
                      {generatedCoilUrl ? (
                        <img src={generatedCoilUrl} alt="Generated Coil" className="w-full h-full object-contain" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xs text-muted">Failed</div>
                      )}
                    </div>
                    {generatedCoilUrl && (
                      <button
                        onClick={() => setEditingImage({ part: 'coil', url: generatedCoilUrl })}
                        className="mt-1.5 w-full py-1 bg-accent hover:bg-accent-hover text-white text-[11px] font-medium rounded transition-colors"
                      >
                        ✎ Edit
                      </button>
                    )}
                    {coilHistory.length > 1 && (
                      <div className="mt-1.5">
                        <div className="text-[9px] text-muted mb-0.5">{coilHistory.length} versions — click to switch</div>
                        <div className="flex gap-1 overflow-x-auto">
                          {coilHistory.map((h) => (
                            <button
                              key={h.url}
                              onClick={() => setGeneratedCoilUrl(h.url)}
                              className={`shrink-0 w-10 h-10 rounded border-2 overflow-hidden ${
                                generatedCoilUrl === h.url ? 'border-accent ring-1 ring-accent/40' : 'border-border'
                              }`}
                              title={h.label}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={h.url} alt={h.label} className="w-full h-full object-cover" />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  {!coilOnly && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] text-muted">Base</span>
                        {generatedBaseUrl && <ImageDownloadButtons imageUrl={generatedBaseUrl} filename={`${concept.name}-base`} />}
                      </div>
                      <div className="aspect-square rounded-lg border border-border overflow-hidden bg-surface">
                        {generatedBaseUrl ? (
                          <img src={generatedBaseUrl} alt="Generated Base" className="w-full h-full object-contain" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted">Failed</div>
                        )}
                      </div>
                      {generatedBaseUrl && (
                        <button
                          onClick={() => setEditingImage({ part: 'base', url: generatedBaseUrl })}
                          className="mt-1.5 w-full py-1 bg-accent hover:bg-accent-hover text-white text-[11px] font-medium rounded transition-colors"
                        >
                          ✎ Edit
                        </button>
                      )}
                      {baseHistory.length > 1 && (
                        <div className="mt-1.5">
                          <div className="text-[9px] text-muted mb-0.5">{baseHistory.length} versions — click to switch</div>
                          <div className="flex gap-1 overflow-x-auto">
                            {baseHistory.map((h) => (
                              <button
                                key={h.url}
                                onClick={() => setGeneratedBaseUrl(h.url)}
                                className={`shrink-0 w-10 h-10 rounded border-2 overflow-hidden ${
                                  generatedBaseUrl === h.url ? 'border-accent ring-1 ring-accent/40' : 'border-border'
                                }`}
                                title={h.label}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={h.url} alt={h.label} className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2">
                {!saved ? (
                  <>
                    <button
                      onClick={handleSave}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg font-medium transition-colors"
                    >
                      Save as New Version
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="flex-1 py-2.5 bg-background border border-border text-foreground text-sm rounded-lg hover:bg-surface-hover transition-colors"
                    >
                      Regenerate
                    </button>
                  </>
                ) : (
                  <div className="flex-1 py-2.5 bg-green-50 text-green-700 text-sm rounded-lg font-medium text-center border border-green-200">
                    Saved as Version {concept.versions.length}
                  </div>
                )}
              </div>

              {saved && (
                <button
                  onClick={handleSaveAndClose}
                  className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
                >
                  Done
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {editingImage && (
        <EditImageModal
          imageUrl={editingImage.url}
          label={editingImage.part}
          conceptId={concept.id}
          onEdited={({ url }) => {
            // Add to history (preserve old) and switch the active preview
            if (editingImage.part === 'coil') {
              setGeneratedCoilUrl(url);
              addCoilToHistory(url, 'edited');
            } else {
              setGeneratedBaseUrl(url);
              addBaseToHistory(url, 'edited');
            }
          }}
          onClose={() => setEditingImage(null)}
        />
      )}
    </div>
  );
}
