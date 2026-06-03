'use client';

import { useState, useMemo, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { GenerationMode, CoilBaseRelationship } from '@/lib/types';
import { Input, TextArea, Select, SliderInput } from './ui';
import { buildCoilPrompt, buildBasePrompt, SAMPLE_PROMPTS } from '@/lib/prompt-builder';
import { ImageDownloadButtons } from './image-download';
import { useToast } from './toast';
import { DesignReviewer } from './design-reviewer';
import { EditImageModal } from './edit-image-modal';
import { safeJsonResponse } from '@/lib/fetch-helpers';

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

export function AIGeneration({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts, addConcept, addAIGeneration, addVersion, openAIKey, geminiKey } = useAppStore();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [themePrompt, setThemePrompt] = useState('');
  const [references, setReferences] = useState('');
  const [constraints, setConstraints] = useState('');
  const [complexityLevel, setComplexityLevel] = useState(3);
  const [coilInstructions, setCoilInstructions] = useState('');
  const [baseInstructions, setBaseInstructions] = useState('');
  const [relationship, setRelationship] = useState<CoilBaseRelationship>('thematic');
  const [mode, setMode] = useState<GenerationMode>('production_bw');
  const [contrast, setContrast] = useState('high');
  const [density, setDensity] = useState('medium');
  const [coilShape, setCoilShape] = useState<'square' | 'rectangle'>('rectangle');
  const [baseShape, setBaseShape] = useState<'circle' | 'oval' | 'square' | 'rectangle'>('circle');
  // Default to ChatGPT Image 2.0 — graceful fallback to 1.0 already
  // wired up server-side if v2 hiccups, so the user-facing experience
  // is "2.0 unless it can't" without exposing the fallback mechanics.
  const [aiModel, setAiModel] = useState<'openai' | 'openai_v2' | 'gemini'>('openai_v2');
  const [coilOnly, setCoilOnly] = useState(false);
  // For inline editing of the generated images BEFORE saving as a concept
  const [editingImage, setEditingImage] = useState<{ part: 'coil' | 'base'; url: string } | null>(null);
  // Captures the ACTUAL model/provider the server reported using on the
  // last generation. Differs from `aiModel` when v2 fell back to v1.
  const [lastModelUsed, setLastModelUsed] = useState<string | undefined>(undefined);
  const [lastProviderUsed, setLastProviderUsed] = useState<string | undefined>(undefined);
  const [refineMode, setRefineMode] = useState(false);

  const [generating, setGenerating] = useState(false);
  const [generatedCoilUrl, setGeneratedCoilUrl] = useState('');
  const [generatedBaseUrl, setGeneratedBaseUrl] = useState('');

  /* ───────── Generation countdown timer ─────────
   * Track when a generation started so the UI can show an elapsed
   * counter + an estimated time remaining. The estimate is per-model
   * because v2 is meaningfully slower than v1/Gemini. Updated every
   * 250ms while generating; cleared on completion.
   *
   * Estimates are empirical — adjust based on observed real-world
   * latencies. We keep them slightly pessimistic so the UI shows
   * "still working" rather than "stuck" past the estimate.
   */
  const ESTIMATED_GEN_SECONDS: Record<string, number> = {
    openai_v2: 35, // gpt-image-2 is typically 25-40s
    openai: 18,    // gpt-image-1 is typically 12-22s
    gemini: 12,    // Gemini 2.5 Flash Image is typically 8-15s
  };
  const [genStartedAt, setGenStartedAt] = useState<number | null>(null);
  const [genElapsedMs, setGenElapsedMs] = useState(0);
  useEffect(() => {
    if (!generating || !genStartedAt) {
      setGenElapsedMs(0);
      return;
    }
    const id = setInterval(() => {
      setGenElapsedMs(Date.now() - genStartedAt);
    }, 250);
    return () => clearInterval(id);
  }, [generating, genStartedAt]);

  /** Pretty-print a duration in ms as M:SS or seconds. */
  const formatElapsed = (ms: number): string => {
    const totalSec = Math.floor(ms / 1000);
    if (totalSec < 60) return `${totalSec}s`;
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  /* ───────── Upload-to-engraving flow ─────────
   * Lets a designer drop in any photo (their dog, a logo sketch, a
   * pinterest-saved tattoo idea) and have AI redraw it as a laser-
   * engraving-ready design. Reuses the existing /api/edit-image
   * endpoint with a strict B&W engraving prompt — the same path
   * concept-detail uses for image edits, just kicked off from a
   * fresh upload instead of an existing concept image. */
  const [uploadedImage, setUploadedImage] = useState<string>('');
  const [uploadedFilename, setUploadedFilename] = useState<string>('');
  const [convertingUpload, setConvertingUpload] = useState(false);
  const [convertTarget, setConvertTarget] = useState<'coil' | 'base'>('coil');
  const [convertFidelity, setConvertFidelity] = useState<'subtle' | 'medium' | 'aggressive'>('subtle');

  const onUploadFileSelected = (file: File) => {
    setUploadedFilename(file.name);
    const reader = new FileReader();
    reader.onload = () => setUploadedImage(String(reader.result || ''));
    reader.readAsDataURL(file);
  };

  const handleConvertUpload = async () => {
    if (!uploadedImage) { setError('Choose an image first.'); return; }
    if (!openAIKey) { setError('Set your OpenAI API key in Settings first.'); return; }
    setConvertingUpload(true);
    setError('');
    try {
      // Strict engraving conversion prompt. Tuned to preserve the
      // subject's identity but reformat it for laser output: pure B&W,
      // bold line work, no gradients, no fine detail that breaks under
      // 0.4mm. Fidelity slider biases between "near photo" and
      // "stylized engraving sketch".
      const fidelityHint =
        convertFidelity === 'aggressive'
          ? 'Reinterpret the subject as a stylized laser-engraving design — strong artistic interpretation, treat the original as inspiration not a literal source.'
          : convertFidelity === 'medium'
            ? 'Faithfully preserve the subject\'s recognizable features and pose, but redraw with the bold engraving aesthetic.'
            : 'Stay as close to the original subject as the laser-engraving constraints allow — same pose, same identifying features, same composition.';

      const editPrompt =
        `Convert this image into a black-and-white laser-engraving design suitable for direct laser engraving on glass. ` +
        `${fidelityHint} ` +
        `Output requirements: pure black on pure white, no gray, no shading, no gradients, no half-tones. ` +
        `Bold confident line work. No line thinner than ~0.4mm equivalent at print scale. ` +
        `No fine detail that would not survive the laser. Strong silhouette readability. ` +
        `Background must be solid white — no scenery, no environmental detail, just the subject.`;

      const targetSize = convertTarget === 'coil' && coilShape === 'rectangle'
        ? '1536x1024'
        : '1024x1024';

      const res = await fetch('/api/edit-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl: uploadedImage,
          editPrompt,
          apiKey: openAIKey,
          size: targetSize,
          strength: convertFidelity,
          preserveComposition: convertFidelity === 'subtle',
          preserveSubject: true,
          folder: 'upload-conversions',
          filename: `${(title || 'upload').replace(/[^a-z0-9-]/gi, '-').slice(0,30)}-${Date.now()}`,
        }),
      });
      const data = await safeJsonResponse(res);
      if (!res.ok || !data.url) {
        throw new Error((data.error as string) || 'Conversion failed');
      }
      const url = data.url as string;
      if (convertTarget === 'coil') {
        setGeneratedCoilUrl(url);
        addCoilToHistory(url, 'generated');
      } else {
        setGeneratedBaseUrl(url);
        addBaseToHistory(url, 'generated');
      }
      toast(`Converted upload to engraving — see ${convertTarget} preview`, 'success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConvertingUpload(false);
    }
  };

  const clearUpload = () => {
    setUploadedImage('');
    setUploadedFilename('');
  };

  /**
   * Per-session version history. Every generate / edit ADDS an entry
   * (newest first). The active*Url is what's shown in the preview and
   * what the user saves when they click "Use This Version" — but every
   * version stays accessible via the thumbnail strip below the preview
   * so nothing is ever lost mid-iteration.
   */
  type HistoryEntry = { url: string; label: string; kind: 'generated' | 'edited'; createdAt: number };
  const [coilHistory, setCoilHistory] = useState<HistoryEntry[]>([]);
  const [baseHistory, setBaseHistory] = useState<HistoryEntry[]>([]);

  const addCoilToHistory = (url: string, kind: 'generated' | 'edited' = 'generated') => {
    setCoilHistory((prev) => {
      const idx = prev.length + 1;
      return [{ url, kind, label: `${kind === 'edited' ? 'Edit' : 'Gen'} ${idx}`, createdAt: Date.now() }, ...prev];
    });
  };
  const addBaseToHistory = (url: string, kind: 'generated' | 'edited' = 'generated') => {
    setBaseHistory((prev) => {
      const idx = prev.length + 1;
      return [{ url, kind, label: `${kind === 'edited' ? 'Edit' : 'Gen'} ${idx}`, createdAt: Date.now() }, ...prev];
    });
  };
  const [error, setError] = useState('');
  const [showPromptPreview, setShowPromptPreview] = useState(false);
  const [showSamples, setShowSamples] = useState(false);

  // Which existing concept to generate for (optional)
  const [targetConceptId, setTargetConceptId] = useState('');

  const effectiveConstraints = refineMode && generatedCoilUrl
    ? `REFINE the existing design composition. Do NOT create a completely new design. Keep the same overall layout and theme but apply these specific modifications: ${constraints}`
    : constraints;

  const inputs = {
    title, stylePrompt, themePrompt, references, constraints: effectiveConstraints,
    complexityLevel, coilInstructions, baseInstructions,
    relationship, mode, patternDensity: density, contrast, baseShape, coilShape,
  };

  /* ───────── Design persistence (Save Design / draft auto-save) ─────────
   * The AI Generation form previously held everything in component state,
   * so a refresh wiped any in-progress draft AND any generated images.
   * Now we auto-save the form + URLs + history to localStorage on every
   * change, and the "Save Design" button is implicit (you don't lose it).
   * The "Clear draft" button below the form lets the user start fresh.
   *
   * Note: storage is per-browser. If the team needs cross-device drafts
   * later, promote this to a Supabase row keyed by user id.
   */
  const DRAFT_KEY = 'ai-generation-draft-v1';
  const [draftRestored, setDraftRestored] = useState(false);

  // Restore on mount — only runs once. Wrapped in a try/catch because
  // localStorage can throw in private-browsing modes.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      // Only restore fields we know about — silently ignore extras so a
      // future schema bump doesn't choke on old drafts.
      if (typeof d.title === 'string') setTitle(d.title);
      if (typeof d.stylePrompt === 'string') setStylePrompt(d.stylePrompt);
      if (typeof d.themePrompt === 'string') setThemePrompt(d.themePrompt);
      if (typeof d.references === 'string') setReferences(d.references);
      if (typeof d.constraints === 'string') setConstraints(d.constraints);
      if (typeof d.complexityLevel === 'number') setComplexityLevel(d.complexityLevel);
      if (typeof d.coilInstructions === 'string') setCoilInstructions(d.coilInstructions);
      if (typeof d.baseInstructions === 'string') setBaseInstructions(d.baseInstructions);
      if (typeof d.contrast === 'string') setContrast(d.contrast);
      if (typeof d.density === 'string') setDensity(d.density);
      if (typeof d.coilOnly === 'boolean') setCoilOnly(d.coilOnly);
      if (typeof d.generatedCoilUrl === 'string') setGeneratedCoilUrl(d.generatedCoilUrl);
      if (typeof d.generatedBaseUrl === 'string') setGeneratedBaseUrl(d.generatedBaseUrl);
      if (Array.isArray(d.coilHistory)) setCoilHistory(d.coilHistory);
      if (Array.isArray(d.baseHistory)) setBaseHistory(d.baseHistory);
      setDraftRestored(true);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist on every field change. Throttled by React's batching — at
  // most one write per render. JSON.stringify is fast enough for this
  // payload that we don't bother memoizing.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify({
        title, stylePrompt, themePrompt, references, constraints,
        complexityLevel, coilInstructions, baseInstructions,
        contrast, density, coilOnly,
        generatedCoilUrl, generatedBaseUrl,
        coilHistory, baseHistory,
        savedAt: Date.now(),
      }));
    } catch { /* quota / private mode */ }
  }, [
    title, stylePrompt, themePrompt, references, constraints,
    complexityLevel, coilInstructions, baseInstructions,
    contrast, density, coilOnly,
    generatedCoilUrl, generatedBaseUrl,
    coilHistory, baseHistory,
  ]);

  const clearDraft = () => {
    setTitle(''); setStylePrompt(''); setThemePrompt(''); setReferences('');
    setConstraints(''); setCoilInstructions(''); setBaseInstructions('');
    setGeneratedCoilUrl(''); setGeneratedBaseUrl('');
    setCoilHistory([]); setBaseHistory([]);
    setDraftRestored(false);
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(DRAFT_KEY); } catch {}
    }
    toast('Draft cleared', 'info');
  };

  const coilPrompt = useMemo(() => buildCoilPrompt(inputs), [title, stylePrompt, themePrompt, references, effectiveConstraints, complexityLevel, coilInstructions, baseInstructions, relationship, mode, density, contrast, baseShape, coilShape]);
  const basePrompt = useMemo(() => buildBasePrompt(inputs), [title, stylePrompt, themePrompt, references, effectiveConstraints, complexityLevel, coilInstructions, baseInstructions, relationship, mode, density, contrast, baseShape, coilShape]);

  const handleGenerate = async () => {
    if ((aiModel === 'openai' || aiModel === 'openai_v2') && !openAIKey) {
      setError('Please set your OpenAI API key in Settings first.');
      return;
    }
    if (aiModel === 'gemini' && !geminiKey) {
      setError('Please set your Gemini API key in Settings first.');
      return;
    }
    if (!title.trim()) {
      setError('Please enter a design title.');
      return;
    }

    setGenerating(true);
    setGenStartedAt(Date.now());
    setError('');
    // Don't clear the active preview — keep showing the previous result
    // until the new one arrives, so the history strip stays visible.

    try {
      // Generate BOTH images in parallel (faster + same cost)
      const coilSize = coilShape === 'rectangle' ? '1536x1024' : '1024x1024';
      const baseSizeMap: Record<string, string> = { circle: '1024x1024', oval: '1536x1024', square: '1024x1024', rectangle: '1536x1024' };
      const baseSize = baseSizeMap[baseShape] || '1024x1024';

      const coilJob = fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: coilPrompt, apiKey: openAIKey, geminiKey, size: coilSize, model: aiModel, quality: 'medium', complexityLevel }),
      });
      const baseJob = coilOnly
        ? Promise.resolve(null)
        : fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: basePrompt, apiKey: openAIKey, geminiKey, size: baseSize, model: aiModel, quality: 'medium', complexityLevel }),
          });
      const [coilRes, baseRes] = await Promise.all([coilJob, baseJob]);

      const coilData = await safeJsonResponse(coilRes);
      if (!coilRes.ok || !coilData.imageUrl) {
        throw new Error((coilData.error as string) || 'Failed to generate coil image');
      }
      setGeneratedCoilUrl(coilData.imageUrl as string);
      addCoilToHistory(coilData.imageUrl as string, 'generated');

      let lastModel: string | undefined = coilData.model as string | undefined;
      let lastProvider: string | undefined = coilData.provider as string | undefined;
      let anyFellBack = !!coilData.fellBack;

      if (baseRes) {
        const baseData = await safeJsonResponse(baseRes);
        if (!baseRes.ok || !baseData.imageUrl) {
          throw new Error((baseData.error as string) || 'Failed to generate base image');
        }
        setGeneratedBaseUrl(baseData.imageUrl as string);
        addBaseToHistory(baseData.imageUrl as string, 'generated');
        lastModel = (baseData.model as string | undefined) || lastModel;
        lastProvider = (baseData.provider as string | undefined) || lastProvider;
        anyFellBack = anyFellBack || !!baseData.fellBack;
      }

      setLastModelUsed(lastModel);
      setLastProviderUsed(lastProvider);

      if (anyFellBack && aiModel === 'openai_v2') {
        toast(
          'ChatGPT Image 2.0 didn’t process — generated with ChatGPT Image (1.0) instead.',
          'info',
        );
      }

      // AUTO-SAVE: persist every successful generation to a real concept
      // so a refresh/navigation never loses work (the team complained about
      // "aliens playing music" vanishing). If the user has a target concept
      // selected, append to it; otherwise auto-create a draft in Ideation
      // and pin it as the target so subsequent iterations stack onto the
      // same card. Fire-and-forget so a slow Supabase write doesn't block
      // the preview render.
      try {
        const coilUrl = (coilData.imageUrl as string) || '';
        const baseUrl = baseRes
          ? ((await safeJsonResponse(baseRes.clone())).imageUrl as string) || ''
          : '';
        const resolvedModel = lastModel ?? modelLabel;
        const resolvedProvider = lastProvider ?? providerLabel;

        if (targetConceptId) {
          addAIGeneration(targetConceptId, {
            prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
            coilPrompt,
            basePrompt,
            mode,
            coilImageUrl: coilUrl,
            baseImageUrl: baseUrl,
            model: resolvedModel,
            provider: resolvedProvider,
          });
          addVersion(targetConceptId, {
            coilImageUrl: coilUrl,
            baseImageUrl: baseUrl,
            prompt: coilPrompt,
            notes: 'Auto-saved generation from AI Generate page',
          });
        } else {
          // First generation in this session → create a draft concept so
          // the work is durable, and lock the target so future generations
          // append rather than spawning new drafts.
          const concept = await addConcept({
            name: title || 'Untitled AI Generation',
            description: `AI Generated: ${stylePrompt || '—'} / ${themePrompt || '—'}`,
            tags: [mode, relationship, 'auto-saved'].filter(Boolean) as string[],
            coilImageUrl: coilUrl,
            baseImageUrl: baseUrl,
            coilOnly,
            specs: {
              designStyleName: stylePrompt,
              designTheme: themePrompt,
              patternDensity: density as 'low' | 'medium' | 'high' | 'very_high',
              laserComplexity: complexityLevel as 1 | 2 | 3 | 4 | 5,
              estimatedEtchingTime: '',
              surfaceCoverage: 50,
              lineThickness: '',
              bwContrastGuidance: contrast,
              symmetryRequirement: 'none',
              coordinationMode: relationship,
              productionFeasibility: 3,
              riskNotes: '',
            },
          });
          addAIGeneration(concept.id, {
            prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
            coilPrompt,
            basePrompt,
            mode,
            coilImageUrl: coilUrl,
            baseImageUrl: baseUrl,
            model: resolvedModel,
            provider: resolvedProvider,
          });
          addVersion(concept.id, {
            coilImageUrl: coilUrl,
            baseImageUrl: baseUrl,
            prompt: coilPrompt,
            notes: 'Auto-saved initial generation from AI Generate page',
          });
          // Lock onto this concept so subsequent generations stack onto
          // the same card instead of creating duplicate drafts.
          setTargetConceptId(concept.id);
          toast(`Auto-saved as "${concept.name}" in Ideation — keep generating to stack iterations`, 'success');
        }
      } catch (saveErr) {
        // Auto-save failed — surface but don't block. The user can still
        // click "Save as New Concept" manually if they want to retry.
        // eslint-disable-next-line no-console
        console.error('Auto-save concept failed:', saveErr);
        toast('Generated, but auto-save failed — use the Save buttons below to keep your work.', 'info');
      }

    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
      setGenStartedAt(null);
    }
  };

  // Resolve the model identifier — prefer the ACTUAL model the server
  // reported using (post-fallback) over the user's selection.
  const modelLabel =
    lastModelUsed
    ?? (aiModel === 'gemini' ? 'gemini-2.5-flash-image'
      : aiModel === 'openai_v2' ? 'gpt-image-2'
      : 'gpt-image-1');
  const providerLabel = lastProviderUsed ?? aiModel;

  const handleSaveAsNewConcept = async () => {
    const concept = await addConcept({
      name: title,
      description: `AI Generated: ${stylePrompt} / ${themePrompt}`,
      tags: [mode, relationship],
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
    });
    addAIGeneration(concept.id, {
      prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
      coilPrompt,
      basePrompt,
      mode,
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      model: modelLabel,
      provider: providerLabel,
    });
    addVersion(concept.id, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      prompt: coilPrompt,
      notes: `AI generated initial concept (${modelLabel})`,
    });
    toast('Concept created from generation', 'success');
    onOpenConcept(concept.id);
  };

  const handleSaveToExisting = () => {
    if (!targetConceptId) return;
    addAIGeneration(targetConceptId, {
      prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
      coilPrompt,
      basePrompt,
      mode,
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      model: modelLabel,
      provider: providerLabel,
    });
    addVersion(targetConceptId, {
      coilImageUrl: generatedCoilUrl,
      baseImageUrl: generatedBaseUrl,
      prompt: coilPrompt,
      notes: 'AI generated variation',
    });
    toast('Saved as new version', 'success');
    onOpenConcept(targetConceptId);
  };

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">AI Concept Generation</h2>
          <p className="text-sm text-muted">Generate coordinated Coil + Base design concepts</p>
        </div>
        <button
          onClick={() => setShowSamples(!showSamples)}
          className="text-sm text-accent hover:text-accent-hover"
        >
          {showSamples ? 'Hide' : 'View'} Sample Prompts
        </button>
      </div>

      {/* Sample Prompts Panel */}
      {showSamples && (
        <div className="bg-surface border border-border rounded-xl p-4 mb-4 space-y-4">
          <h3 className="text-sm font-semibold">Sample Prompts Reference</h3>
          {Object.entries(SAMPLE_PROMPTS).map(([key, sample]) => (
            <div key={key} className="border-t border-border pt-3">
              <h4 className="text-xs font-semibold text-accent mb-1">{sample.title}</h4>
              {'coil' in sample ? (
                <div className="space-y-2">
                  <div>
                    <span className="text-[10px] text-muted uppercase">Coil Prompt</span>
                    <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{sample.coil}</pre>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted uppercase">Base Prompt</span>
                    <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{sample.base}</pre>
                  </div>
                </div>
              ) : (
                <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap">{sample.prompt}</pre>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Form */}
        <div className="space-y-4">
          {/* ───── Upload-to-Engraving — alternative to the prompt form ─────
              Drop in a reference photo (a dog, a logo sketch, a tattoo
              pinterest save) and have AI redraw it as a laser-
              engraving-ready B&W design. Lives at the TOP of the form
              so it reads as a peer to the prompt-based generation, not
              a hidden alternative. */}
          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold">Or upload a reference image</h3>
              <span className="text-[10px] text-muted">AI redraws it for the laser</span>
            </div>

            {uploadedImage ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={uploadedImage}
                  alt={uploadedFilename}
                  className="w-full rounded-lg border border-border object-contain bg-background"
                  style={{ maxHeight: 180 }}
                />
                <button
                  type="button"
                  onClick={clearUpload}
                  disabled={convertingUpload}
                  className="absolute top-2 right-2 text-[10px] bg-background/90 border border-border rounded px-2 py-1 hover:bg-background disabled:opacity-50"
                >
                  Remove
                </button>
                <div className="text-[10px] text-muted mt-1 mono truncate">{uploadedFilename}</div>
              </div>
            ) : (
              <label className="block border-2 border-dashed border-border rounded-lg p-5 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-colors">
                <div className="text-xs text-muted">Drop or click to upload a photo / sketch / logo</div>
                <div className="text-[10px] text-muted mt-1">JPG / PNG, the original isn&apos;t kept — only the engraving version</div>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) onUploadFileSelected(e.target.files[0]); }}
                />
              </label>
            )}

            {uploadedImage && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                      Save as
                    </label>
                    <div className="inline-flex rounded-lg border border-border overflow-hidden w-full">
                      <button
                        type="button"
                        onClick={() => setConvertTarget('coil')}
                        className={`flex-1 text-xs py-1.5 ${convertTarget === 'coil' ? 'bg-foreground text-surface' : 'bg-surface hover:bg-surface-hover'}`}
                      >
                        Coil
                      </button>
                      <button
                        type="button"
                        onClick={() => setConvertTarget('base')}
                        className={`flex-1 text-xs py-1.5 border-l border-border ${convertTarget === 'base' ? 'bg-foreground text-surface' : 'bg-surface hover:bg-surface-hover'}`}
                      >
                        Base
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-muted mb-1">
                      Fidelity
                    </label>
                    <select
                      value={convertFidelity}
                      onChange={(e) => setConvertFidelity(e.target.value as typeof convertFidelity)}
                      className="w-full bg-background border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                      title="How closely the AI should stick to the original"
                    >
                      <option value="subtle">Faithful — close to original</option>
                      <option value="medium">Balanced</option>
                      <option value="aggressive">Loose — stylized interpretation</option>
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleConvertUpload}
                  disabled={convertingUpload || !openAIKey}
                  className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {convertingUpload ? '✦ Converting to engraving…' : '✦ Convert to laser engraving'}
                </button>
                <div className="text-[10px] text-muted">
                  Uses your OpenAI key. Result replaces the {convertTarget} preview on the right and joins this session's history strip.
                </div>
              </>
            )}
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Design Parameters</h3>

            <div>
              <label className="block text-xs text-muted mb-1">Design Title *</label>
              <Input value={title} onChange={setTitle} placeholder="e.g., Sacred Geometry Mandala" />
            </div>

            {/* AI Model Selector — three options for A/B comparison.
                Order per user: ChatGPT Image → ChatGPT Image 2.0 → Gemini. */}
            <div>
              <label className="block text-xs text-muted mb-1.5">AI Model</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setAiModel('openai')}
                  className={`py-2.5 px-2 text-sm rounded-lg border-2 transition-colors font-medium ${
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
                  className={`py-2.5 px-2 text-sm rounded-lg border-2 transition-colors font-medium ${
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
                  className={`py-2.5 px-2 text-sm rounded-lg border-2 transition-colors font-medium ${
                    aiModel === 'gemini'
                      ? 'bg-blue-500/10 border-blue-400 text-blue-600'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  Gemini
                </button>
              </div>
              {(aiModel === 'openai' || aiModel === 'openai_v2') && !openAIKey && (
                <p className="text-xs text-amber-600 mt-1">OpenAI key required — set it in Settings</p>
              )}
              {aiModel === 'gemini' && !geminiKey && (
                <p className="text-xs text-amber-600 mt-1">Gemini key required — set it in Settings</p>
              )}
              {aiModel === 'openai_v2' && (
                <p className="text-[11px] text-purple-700 mt-1">
                  ✦ Routes to <code>gpt-image-2</code> with extra-strict engraving prompt augmentation.
                </p>
              )}
            </div>

            {/* COIL-ONLY TOGGLE — large, hard-to-miss segmented control */}
            <div>
              <label className="block text-xs font-medium mb-1.5">Design scope</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setCoilOnly(false)}
                  className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                    !coilOnly
                      ? 'bg-accent/10 border-accent'
                      : 'bg-background border-border hover:border-accent/40'
                  }`}
                >
                  <div className="text-sm font-semibold">Coil + Base</div>
                  <div className="text-[11px] text-muted leading-tight">
                    Generate both the cylindrical wrap and the base piece
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setCoilOnly(true)}
                  className={`text-left px-3 py-2.5 rounded-lg border-2 transition-colors ${
                    coilOnly
                      ? 'bg-accent/10 border-accent'
                      : 'bg-background border-border hover:border-accent/40'
                  }`}
                >
                  <div className="text-sm font-semibold">Coil only</div>
                  <div className="text-[11px] text-muted leading-tight">
                    Skip the base — just generate the coil image
                  </div>
                </button>
              </div>
            </div>

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

            <div>
              <label className="block text-xs text-muted mb-1">Style Prompt</label>
              <Input value={stylePrompt} onChange={setStylePrompt} placeholder="e.g., geometric, mandala, sacred geometry" />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Theme Prompt</label>
              <Input value={themePrompt} onChange={setThemePrompt} placeholder="e.g., spiritual, mathematical, nature" />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">References / Inspiration</label>
              <TextArea value={references} onChange={setReferences} placeholder="Describe reference images or inspiration..." rows={2} />
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Laser Etching Constraints</label>
              <TextArea value={constraints} onChange={setConstraints} placeholder="Special constraints for laser etching..." rows={2} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-muted mb-1">Contrast</label>
                <Select value={contrast} onChange={setContrast} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }]} />
              </div>
              <div>
                <label className="block text-xs text-muted mb-1">Pattern Density</label>
                <Select value={density} onChange={setDensity} options={[{ value: 'low', label: 'Low' }, { value: 'medium', label: 'Medium' }, { value: 'high', label: 'High' }, { value: 'very_high', label: 'Very High' }]} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <SliderInput value={complexityLevel} onChange={setComplexityLevel} label="Complexity Level" />
              <div>
                <label className="block text-xs text-muted mb-1">Coil Image Shape</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCoilShape('rectangle')}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                      coilShape === 'rectangle'
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-background border-border text-muted hover:text-foreground'
                    }`}
                  >
                    <span className="w-10 h-6 border border-current rounded-sm" />
                    Rectangle
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoilShape('square')}
                    className={`flex-1 py-2 text-xs rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                      coilShape === 'square'
                        ? 'bg-accent/20 border-accent text-accent'
                        : 'bg-background border-border text-muted hover:text-foreground'
                    }`}
                  >
                    <span className="w-6 h-6 border border-current rounded-sm" />
                    Square
                  </button>
                </div>
                <p className="text-[10px] text-muted mt-1">{coilShape === 'rectangle' ? 'Wider format — better for wraparound coil designs' : 'Square format — equal proportions'}</p>
              </div>
            </div>

            <div>
              <label className="block text-xs text-muted mb-1">Base Image Shape</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setBaseShape('circle')}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                    baseShape === 'circle'
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  <span className="w-6 h-6 border border-current rounded-full" />
                  Circle
                </button>
                <button
                  type="button"
                  onClick={() => setBaseShape('oval')}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                    baseShape === 'oval'
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  <span className="w-9 h-6 border border-current rounded-full" />
                  Oval
                </button>
                <button
                  type="button"
                  onClick={() => setBaseShape('square')}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                    baseShape === 'square'
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  <span className="w-6 h-6 border border-current rounded-sm" />
                  Square
                </button>
                <button
                  type="button"
                  onClick={() => setBaseShape('rectangle')}
                  className={`flex-1 py-2 text-xs rounded-lg border transition-colors flex flex-col items-center gap-1 ${
                    baseShape === 'rectangle'
                      ? 'bg-accent/20 border-accent text-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  <span className="w-10 h-6 border border-current rounded-sm" />
                  Rectangle
                </button>
              </div>
              <p className="text-[10px] text-muted mt-1">{baseShape === 'circle' ? 'Circular base — classic round coaster' : baseShape === 'oval' ? 'Oval base — elliptical shape' : baseShape === 'square' ? 'Square base — equal proportions' : 'Rectangular base — wider than tall'}</p>
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Part-Specific Instructions</h3>
            <div>
              <label className="block text-xs text-muted mb-1">Coil-Specific Instructions</label>
              <TextArea value={coilInstructions} onChange={setCoilInstructions} placeholder="Instructions specific to the coil piece..." rows={2} />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">Base-Specific Instructions</label>
              <TextArea value={baseInstructions} onChange={setBaseInstructions} placeholder="Instructions specific to the base piece..." rows={2} />
            </div>
          </div>

          <div className="bg-surface border border-border rounded-xl p-4 space-y-3">
            <h3 className="text-sm font-semibold">Save to Existing Concept (Optional)</h3>
            <Select
              value={targetConceptId}
              onChange={setTargetConceptId}
              placeholder="Create new concept"
              options={concepts.map((c) => ({ value: c.id, label: `${c.name} (${c.status})` }))}
            />
          </div>

          {/* Prompt Preview */}
          <div className="bg-surface border border-border rounded-xl p-4">
            <button
              onClick={() => setShowPromptPreview(!showPromptPreview)}
              className="text-sm font-semibold flex items-center gap-1"
            >
              <span>{showPromptPreview ? '▾' : '▸'}</span> Preview Built Prompts
            </button>
            {showPromptPreview && (
              <div className="mt-3 space-y-3">
                <div>
                  <span className="text-[10px] text-muted uppercase">Coil Prompt</span>
                  <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{coilPrompt}</pre>
                </div>
                <div>
                  <span className="text-[10px] text-muted uppercase">Base Prompt</span>
                  <pre className="text-xs text-muted bg-background rounded p-2 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">{basePrompt}</pre>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Refine vs New Design toggle — only shown when images exist */}
          {generatedCoilUrl && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <label className="block text-xs text-muted mb-2">Generation Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setRefineMode(false)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                    !refineMode
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  New Design
                </button>
                <button
                  type="button"
                  onClick={() => setRefineMode(true)}
                  className={`flex-1 py-2 text-sm rounded-lg border transition-colors font-medium ${
                    refineMode
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-background border-border text-muted hover:text-foreground'
                  }`}
                >
                  Refine Existing
                </button>
              </div>
              {refineMode && (
                <p className="text-[10px] text-muted mt-1">Will keep the same overall layout and theme, applying your constraints as modifications.</p>
              )}
            </div>
          )}

          {!stylePrompt && !themePrompt && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-700">Tip: Add a style or theme prompt for better results.</div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating || !title.trim()}
            className="w-full py-3 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium transition-colors disabled:opacity-50"
          >
            {generating
              ? (() => {
                  // Show elapsed time + ETA so the user knows it's working
                  // and roughly when to expect the image. Past the ETA we
                  // switch to "still working…" so the message stays honest.
                  const elapsedSec = Math.floor(genElapsedMs / 1000);
                  const etaSec = ESTIMATED_GEN_SECONDS[aiModel] ?? 25;
                  const remaining = etaSec - elapsedSec;
                  if (remaining > 0) {
                    return `✦ Generating… ${formatElapsed(genElapsedMs)} · ~${remaining}s left`;
                  }
                  return `✦ Generating… ${formatElapsed(genElapsedMs)} · still working`;
                })()
              : '✦ Generate Coil + Base Concepts'}
          </button>
          {generating && (
            <div className="w-full h-1 bg-background rounded-full overflow-hidden mt-1">
              <div
                className="h-full bg-accent transition-all"
                style={{
                  width: `${Math.min(100, (genElapsedMs / 1000 / (ESTIMATED_GEN_SECONDS[aiModel] ?? 25)) * 100)}%`,
                }}
              />
            </div>
          )}

          {/* Draft persistence strip — surfaces the auto-save behavior so
              the team knows their work won't vanish on refresh, plus a
              one-click escape hatch when they want a fresh canvas. */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-muted px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" aria-hidden />
              {draftRestored
                ? 'Draft auto-restored from last session — keep working or clear it.'
                : 'Auto-saved as you work — survives reloads.'}
            </span>
            <button
              type="button"
              onClick={clearDraft}
              className="hover:text-foreground underline-offset-2 hover:underline"
              title="Wipe the auto-saved draft from this browser"
            >
              Clear draft
            </button>
          </div>
        </div>

        {/* Output Preview */}
        <div className="space-y-4">
          <div className="bg-surface border border-border rounded-xl p-4">
            <h3 className="text-sm font-semibold mb-3">Generated Output</h3>

            <div className={`grid gap-4 ${coilOnly ? 'grid-cols-1 max-w-[50%] mx-auto' : 'grid-cols-2'}`}>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted">Coil Concept</span>
                  {generatedCoilUrl && <ImageDownloadButtons imageUrl={generatedCoilUrl} filename={`${title || 'concept'}-coil`} />}
                </div>
                <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                  {generatedCoilUrl ? (
                    <img src={generatedCoilUrl} alt="Generated Coil" className="w-full h-full object-contain" />
                  ) : generating ? (
                    <div className="flex flex-col items-center gap-2">
                      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                      <span className="text-xs text-muted">Generating...</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">Coil preview</span>
                  )}
                </div>
                {generatedCoilUrl && (
                  <button
                    onClick={() => setEditingImage({ part: 'coil', url: generatedCoilUrl })}
                    className="mt-2 w-full py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors"
                    title="Make small changes — describe what to tweak (e.g. 'thicker lines', 'remove the border')"
                  >
                    ✎ Edit this image
                  </button>
                )}
                {coilHistory.length > 1 && (
                  <div className="mt-2">
                    <div className="text-[10px] text-muted mb-1 flex items-center justify-between">
                      <span>History — {coilHistory.length} version{coilHistory.length !== 1 ? 's' : ''}</span>
                      <span className="italic">click any to switch</span>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                      {coilHistory.map((h) => (
                        <button
                          key={h.url}
                          onClick={() => setGeneratedCoilUrl(h.url)}
                          className={`shrink-0 w-14 rounded border-2 transition-all overflow-hidden ${
                            generatedCoilUrl === h.url
                              ? 'border-accent ring-2 ring-accent/30'
                              : 'border-border hover:border-accent/60'
                          }`}
                          title={`${h.label} — ${new Date(h.createdAt).toLocaleTimeString()}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={h.url} alt={h.label} className="w-full h-14 object-cover bg-background" />
                          <div className={`text-[8px] py-0.5 truncate ${
                            h.kind === 'edited' ? 'bg-accent/10 text-accent' : 'bg-background text-muted'
                          }`}>
                            {h.label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {!coilOnly && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted">Base Concept</span>
                    {generatedBaseUrl && <ImageDownloadButtons imageUrl={generatedBaseUrl} filename={`${title || 'concept'}-base`} />}
                  </div>
                  <div className="aspect-square rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden">
                    {generatedBaseUrl ? (
                      <img src={generatedBaseUrl} alt="Generated Base" className="w-full h-full object-contain" />
                    ) : generating ? (
                      <div className="flex flex-col items-center gap-2">
                        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                        <span className="text-xs text-muted">Generating...</span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">Base preview</span>
                    )}
                  </div>
                  {generatedBaseUrl && (
                    <button
                      onClick={() => setEditingImage({ part: 'base', url: generatedBaseUrl })}
                      className="mt-2 w-full py-1.5 bg-accent hover:bg-accent-hover text-white text-xs font-medium rounded-lg transition-colors"
                      title="Make small changes — describe what to tweak"
                    >
                      ✎ Edit this image
                    </button>
                  )}
                  {baseHistory.length > 1 && (
                    <div className="mt-2">
                      <div className="text-[10px] text-muted mb-1 flex items-center justify-between">
                        <span>History — {baseHistory.length} version{baseHistory.length !== 1 ? 's' : ''}</span>
                        <span className="italic">click any to switch</span>
                      </div>
                      <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {baseHistory.map((h) => (
                          <button
                            key={h.url}
                            onClick={() => setGeneratedBaseUrl(h.url)}
                            className={`shrink-0 w-14 rounded border-2 transition-all overflow-hidden ${
                              generatedBaseUrl === h.url
                                ? 'border-accent ring-2 ring-accent/30'
                                : 'border-border hover:border-accent/60'
                            }`}
                            title={`${h.label} — ${new Date(h.createdAt).toLocaleTimeString()}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={h.url} alt={h.label} className="w-full h-14 object-cover bg-background" />
                            <div className={`text-[8px] py-0.5 truncate ${
                              h.kind === 'edited' ? 'bg-accent/10 text-accent' : 'bg-background text-muted'
                            }`}>
                              {h.label}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Combined Preview */}
            {(generatedCoilUrl || generatedBaseUrl) && (
              <div className="mt-4">
                <span className="text-xs text-muted block mb-1">Combined Preview</span>
                <div className="flex gap-2 items-end bg-background rounded-lg p-4 border border-border">
                  <div className="flex-1">
                    {generatedCoilUrl && <img src={generatedCoilUrl} alt="Coil" className="w-full rounded" />}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted text-center block">Coil</span>
                      {generatedCoilUrl && <ImageDownloadButtons imageUrl={generatedCoilUrl} filename={`${title || 'concept'}-coil-combined`} />}
                    </div>
                  </div>
                  <div className="text-muted text-lg">+</div>
                  <div className="flex-1">
                    {generatedBaseUrl && <img src={generatedBaseUrl} alt="Base" className="w-full rounded" />}
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-[10px] text-muted text-center block">Base</span>
                      {generatedBaseUrl && <ImageDownloadButtons imageUrl={generatedBaseUrl} filename={`${title || 'concept'}-base-combined`} />}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Persona reviewer panel — purely feedback, does not affect designs */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <DesignReviewer
              name={title}
              description={themePrompt || stylePrompt}
              style={stylePrompt}
              theme={themePrompt}
              coilImageUrl={generatedCoilUrl}
              baseImageUrl={generatedBaseUrl}
            />
          )}

          {/* Actions when images are generated */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <div className="bg-surface border border-border rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-semibold mb-2">Actions</h3>
              <button
                onClick={handleSaveAsNewConcept}
                className="w-full py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
              >
                Save as New Concept
              </button>
              {targetConceptId && (
                <button
                  onClick={handleSaveToExisting}
                  className="w-full py-2 bg-green-600 hover:bg-green-700 text-white text-sm rounded-lg transition-colors"
                >
                  Save as Version to Selected Concept
                </button>
              )}
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full py-2 bg-background border border-border text-foreground text-sm rounded-lg hover:bg-surface-hover transition-colors"
              >
                Regenerate
              </button>
            </div>
          )}

          {/* Quick refinement actions */}
          {(generatedCoilUrl || generatedBaseUrl) && (
            <div className="bg-surface border border-border rounded-xl p-4">
              <h3 className="text-sm font-semibold mb-2">Quick Refinements</h3>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: 'Generate More Like This', action: 'generate_more' },
                  { label: 'Refine This Concept', action: 'refine' },
                  { label: 'Simplify for Laser', action: 'simplify_laser' },
                  { label: 'Coordinate More', action: 'coordinate_more' },
                  { label: 'Complement Base', action: 'complement_base' },
                  { label: 'Higher Contrast', action: 'higher_contrast' },
                  { label: 'Reduce Detail', action: 'reduce_detail' },
                ].map((btn) => (
                  <button
                    key={btn.action}
                    onClick={() => {
                      // For now, these set a constraint and re-generate
                      setConstraints(`REFINEMENT: ${btn.label}. ${constraints}`);
                    }}
                    className="text-xs py-2 px-3 bg-background border border-border rounded-lg text-muted hover:text-foreground hover:bg-surface-hover transition-colors text-left"
                  >
                    {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Edit Image Modal — opens for either generated image. The new URL
          replaces the previewed image so the team can iterate before
          saving the result as a concept. */}
      {editingImage && (
        <EditImageModal
          imageUrl={editingImage.url}
          label={editingImage.part}
          onEdited={({ url }) => {
            // CRITICAL: don't replace, ADD. The previous version stays in
            // the history strip below the preview so the team can compare
            // and pick whichever they like best when saving the concept.
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
