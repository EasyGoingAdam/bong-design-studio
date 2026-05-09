'use client';

import { useEffect, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept } from '@/lib/types';
import { buildCoilPrompt, buildBasePrompt } from '@/lib/prompt-builder';
import { useToast } from './toast';
import { safeJsonResponse } from '@/lib/fetch-helpers';

/**
 * AI Auto-Pilot — chains all the existing image / scoring / story / review
 * endpoints into a single hands-off pipeline. The user provides a concept
 * with specs and clicks one button; the modal walks through every step,
 * autosaves results to the concept as it goes, and ends with a fully-
 * prepared concept ready for human approval.
 *
 * Steps (each runs as its own async unit so we can show per-step status
 * and recover from individual failures without aborting the whole run):
 *
 *   1. Generate Coil image
 *   2. Generate Base image          (parallel with #1, skipped if coilOnly)
 *   3. Etching score Coil           (parallel)
 *   4. Etching score Base           (parallel, skipped if coilOnly)
 *   5. Auto-fix Coil if score < 7   (1 attempt)
 *   6. Auto-fix Base if score < 7   (parallel, 1 attempt)
 *   7. Generate Marketing Story
 *   8. Persona review               (DesignReviewer auto-runs, this is mostly a UX nudge)
 *
 * No new server orchestration endpoint — the client drives the chain
 * using the existing API surface. This means each individual step
 * benefits from the same auto-save + version-snapshot + caching as a
 * manual click, and per-step failures only mark THAT step as failed.
 */

interface Props {
  concept: Concept;
  onClose: () => void;
}

type StepStatus = 'pending' | 'running' | 'complete' | 'failed' | 'skipped';
interface Step {
  id: string;
  label: string;
  detail?: string;
  status: StepStatus;
  result?: string;        // human-readable outcome line
  error?: string;
}

const SCORE_THRESHOLD = 7;

export function AutoPilotModal({ concept, onClose }: Props) {
  const { openAIKey, updateConcept, addAIGeneration, addVersion } = useAppStore();
  const { toast } = useToast();

  const [steps, setSteps] = useState<Step[]>(() => initialSteps(concept));
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !running) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, running]);

  const updateStep = (id: string, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const runPipeline = async () => {
    if (!openAIKey) {
      toast('Set your OpenAI API key in Settings first', 'error');
      return;
    }
    setRunning(true);
    setDone(false);

    try {
      // ----- Build prompts from the concept's specs -----
      const promptInputs = {
        title: concept.name,
        stylePrompt: concept.specs.designStyleName || concept.tags.join(', '),
        themePrompt: concept.specs.designTheme || concept.description,
        references: '',
        constraints: concept.specs.riskNotes || '',
        complexityLevel: concept.specs.laserComplexity || 3,
        coilInstructions: concept.coilSpecs.notes || '',
        baseInstructions: concept.baseSpecs.notes || '',
        relationship: concept.specs.coordinationMode || 'thematic',
        mode: 'production_bw' as const,
        patternDensity: concept.specs.patternDensity || 'medium',
        contrast: 'high',
        baseShape: concept.specs.baseShape || 'circle',
        coilShape: 'rectangle' as const,
      };
      const coilPrompt = buildCoilPrompt(promptInputs);
      const basePrompt = buildBasePrompt(promptInputs);

      // ----- Step 1 + 2: Generate coil + base in parallel -----
      updateStep('gen-coil', { status: 'running' });
      if (!concept.coilOnly) updateStep('gen-base', { status: 'running' });

      const coilJob = generateImage(coilPrompt, '1536x1024', openAIKey, concept.specs.laserComplexity);
      const baseJob = concept.coilOnly
        ? Promise.resolve(null)
        : generateImage(basePrompt, '1024x1024', openAIKey, concept.specs.laserComplexity);

      const [coilResult, baseResult] = await Promise.all([coilJob, baseJob]);

      let coilUrl = '';
      let baseUrl = '';

      if (coilResult.ok && coilResult.url) {
        coilUrl = coilResult.url;
        updateStep('gen-coil', { status: 'complete', result: 'Coil image generated' });
      } else {
        updateStep('gen-coil', { status: 'failed', error: coilResult.error || 'Generation failed' });
      }

      if (concept.coilOnly) {
        updateStep('gen-base', { status: 'skipped', result: 'Coil-only concept' });
      } else if (baseResult?.ok && baseResult.url) {
        baseUrl = baseResult.url;
        updateStep('gen-base', { status: 'complete', result: 'Base image generated' });
      } else {
        updateStep('gen-base', { status: 'failed', error: baseResult?.error || 'Generation failed' });
      }

      // Persist to the concept immediately
      if (coilUrl || baseUrl) {
        updateConcept(concept.id, {
          coilImageUrl: coilUrl || concept.coilImageUrl,
          baseImageUrl: concept.coilOnly ? '' : (baseUrl || concept.baseImageUrl),
        });
        addAIGeneration(concept.id, {
          prompt: `${coilPrompt}\n\n---\n\n${basePrompt}`,
          coilPrompt,
          basePrompt,
          mode: 'production_bw',
          coilImageUrl: coilUrl,
          baseImageUrl: baseUrl,
          model: 'gpt-image-1',
          provider: 'openai',
        });
        addVersion(concept.id, {
          coilImageUrl: coilUrl,
          baseImageUrl: baseUrl,
          prompt: coilPrompt,
          notes: 'Auto-pilot — initial generation',
        });
      }

      // If foundational generation failed entirely (no coil AND no base, or
      // no coil for a coil-only concept), the rest of the pipeline has
      // nothing to operate on. Mark every downstream step as skipped with an
      // explanatory reason and exit early so the user isn't misled by a
      // string of green "skipped" badges that look like successes.
      const noUsableImage = !coilUrl && (concept.coilOnly || !baseUrl);
      if (noUsableImage) {
        const reason = 'No image to process — generation failed';
        ['score-coil', 'score-base', 'fix-coil', 'fix-base', 'story'].forEach((id) =>
          updateStep(id, { status: 'skipped', result: reason })
        );
        updateStep('review', { status: 'failed', error: 'Pipeline aborted — generation failed. Check API key, quota, and try again.' });
        setRunning(false);
        return;
      }

      // ----- Step 3 + 4: Etching score (parallel) -----
      const scoreCoilJob = coilUrl ? scoreImage(coilUrl, openAIKey) : Promise.resolve(null);
      const scoreBaseJob = baseUrl ? scoreImage(baseUrl, openAIKey) : Promise.resolve(null);

      if (coilUrl) updateStep('score-coil', { status: 'running' });
      else updateStep('score-coil', { status: 'skipped' });
      if (baseUrl) updateStep('score-base', { status: 'running' });
      else updateStep('score-base', { status: 'skipped' });

      const [coilScoreResult, baseScoreResult] = await Promise.all([scoreCoilJob, scoreBaseJob]);

      const coilScore = coilScoreResult?.score ?? 0;
      const baseScore = baseScoreResult?.score ?? 0;

      if (coilScoreResult) {
        updateStep('score-coil', {
          status: 'complete',
          result: `Coil scored ${coilScore}/10 ${coilScore >= SCORE_THRESHOLD ? '✓' : '⚠ needs fix'}`,
        });
      }
      if (baseScoreResult) {
        updateStep('score-base', {
          status: 'complete',
          result: `Base scored ${baseScore}/10 ${baseScore >= SCORE_THRESHOLD ? '✓' : '⚠ needs fix'}`,
        });
      }

      // ----- Step 5 + 6: Auto-fix if score < threshold -----
      const coilNeedsFix = coilScoreResult && coilScore < SCORE_THRESHOLD && coilScoreResult.issues.length > 0;
      const baseNeedsFix = baseScoreResult && baseScore < SCORE_THRESHOLD && baseScoreResult.issues.length > 0;

      const fixCoilJob = coilNeedsFix && coilUrl
        ? autoFixImage(coilUrl, coilScoreResult.issues, openAIKey)
        : Promise.resolve(null);
      const fixBaseJob = baseNeedsFix && baseUrl
        ? autoFixImage(baseUrl, baseScoreResult.issues, openAIKey)
        : Promise.resolve(null);

      if (coilNeedsFix) updateStep('fix-coil', { status: 'running' });
      else updateStep('fix-coil', { status: 'skipped', result: coilScoreResult ? 'Score above threshold — no fix needed' : '' });
      if (baseNeedsFix) updateStep('fix-base', { status: 'running' });
      else updateStep('fix-base', { status: 'skipped', result: baseScoreResult ? 'Score above threshold — no fix needed' : '' });

      const [coilFixResult, baseFixResult] = await Promise.all([fixCoilJob, fixBaseJob]);

      if (coilNeedsFix) {
        if (coilFixResult?.ok && coilFixResult.url) {
          coilUrl = coilFixResult.url;
          updateStep('fix-coil', { status: 'complete', result: 'Coil auto-fixed' });
          updateConcept(concept.id, { coilImageUrl: coilUrl });
          addAIGeneration(concept.id, {
            prompt: `[Auto-pilot fix] ${coilFixResult.prompt}`,
            coilPrompt: '',
            basePrompt: '',
            mode: 'production_bw',
            coilImageUrl: coilUrl,
            baseImageUrl: '',
            model: 'gpt-image-1',
            provider: 'openai',
          });
        } else {
          updateStep('fix-coil', { status: 'failed', error: coilFixResult?.error || 'Auto-fix failed' });
        }
      }
      if (baseNeedsFix) {
        if (baseFixResult?.ok && baseFixResult.url) {
          baseUrl = baseFixResult.url;
          updateStep('fix-base', { status: 'complete', result: 'Base auto-fixed' });
          updateConcept(concept.id, { baseImageUrl: baseUrl });
          addAIGeneration(concept.id, {
            prompt: `[Auto-pilot fix] ${baseFixResult.prompt}`,
            coilPrompt: '',
            basePrompt: '',
            mode: 'production_bw',
            coilImageUrl: '',
            baseImageUrl: baseUrl,
            model: 'gpt-image-1',
            provider: 'openai',
          });
        } else {
          updateStep('fix-base', { status: 'failed', error: baseFixResult?.error || 'Auto-fix failed' });
        }
      }

      // ----- Step 7: Marketing story -----
      updateStep('story', { status: 'running' });
      const storyResult = await generateStory(concept, openAIKey);
      if (storyResult.ok && storyResult.story) {
        updateConcept(concept.id, { marketingStory: storyResult.story });
        updateStep('story', {
          status: 'complete',
          result: `${storyResult.story.slice(0, 80)}${storyResult.story.length > 80 ? '…' : ''}`,
        });
      } else {
        updateStep('story', { status: 'failed', error: storyResult.error || 'Story failed' });
      }

      // ----- Step 8: Persona review nudge -----
      // The DesignReviewer widget on concept detail auto-fetches when the
      // concept has images. We don't run it here; just mark the step as
      // complete and instruct the user to refresh the sidebar.
      updateStep('review', {
        status: 'complete',
        result: 'Personas will auto-review when you re-open the concept',
      });

      setDone(true);
      toast('Auto-pilot complete — concept ready for review', 'success');
    } catch (err) {
      console.error('Auto-pilot pipeline error:', err);
      toast(err instanceof Error ? err.message : 'Pipeline error', 'error');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={running ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-1.5">
              <span>✦</span> Auto-Pilot
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Generate, score, auto-fix, and write the marketing story for <strong>{concept.name}</strong> in one click. Every step auto-saves to the concept.
            </p>
          </div>
          {!running && (
            <button onClick={onClose} className="text-muted hover:text-foreground text-lg leading-none">×</button>
          )}
        </div>

        <div className="p-5 space-y-4">
          {/* Stepper */}
          <ol className="space-y-2">
            {steps.map((step, idx) => (
              <li
                key={step.id}
                className={`flex items-start gap-3 p-3 rounded-lg border transition-colors ${
                  step.status === 'running' ? 'bg-accent/5 border-accent' :
                  step.status === 'complete' ? 'bg-emerald-50 border-emerald-200' :
                  step.status === 'failed' ? 'bg-red-50 border-red-200' :
                  step.status === 'skipped' ? 'bg-background border-border opacity-60' :
                  'bg-background border-border'
                }`}
              >
                <div className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  step.status === 'running' ? 'bg-accent text-white' :
                  step.status === 'complete' ? 'bg-emerald-600 text-white' :
                  step.status === 'failed' ? 'bg-red-600 text-white' :
                  step.status === 'skipped' ? 'bg-gray-300 text-white' :
                  'bg-border text-muted'
                }`}>
                  {step.status === 'running' ? (
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : step.status === 'complete' ? '✓'
                    : step.status === 'failed' ? '✗'
                    : step.status === 'skipped' ? '–'
                    : idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{step.label}</div>
                  {step.detail && (
                    <div className="text-[11px] text-muted leading-snug">{step.detail}</div>
                  )}
                  {step.result && step.status !== 'running' && (
                    <div className="text-[11px] text-muted mt-0.5 italic truncate">{step.result}</div>
                  )}
                  {step.error && (
                    <div className="text-[11px] text-red-700 mt-0.5">⚠ {step.error}</div>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Action */}
          <div className="pt-3 border-t border-border">
            {!running && !done && (
              <>
                <button
                  onClick={runPipeline}
                  className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
                >
                  ✦ Run Auto-Pilot
                </button>
                <p className="text-[11px] text-muted text-center mt-2 italic">
                  Takes 1–3 minutes. You can keep working in another tab — every step auto-saves.
                </p>
              </>
            )}
            {running && (
              <div className="text-center text-xs text-muted">
                Pipeline running… please don&apos;t close this modal until it finishes.
              </div>
            )}
            {done && (
              <button
                onClick={onClose}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                ✓ Done — Open Concept
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Initial step list — shape only, all start `pending`.
// ----------------------------------------------------------------
function initialSteps(concept: Concept): Step[] {
  return [
    { id: 'gen-coil', label: 'Generate Coil image', detail: 'OpenAI gpt-image-1 from concept specs', status: 'pending' },
    { id: 'gen-base', label: 'Generate Base image', detail: concept.coilOnly ? 'Skipped — concept is coil-only' : 'OpenAI gpt-image-1 from concept specs', status: 'pending' },
    { id: 'score-coil', label: 'Etching score Coil', detail: 'GPT-4o vision grades laser-etch viability', status: 'pending' },
    { id: 'score-base', label: 'Etching score Base', detail: 'GPT-4o vision grades laser-etch viability', status: 'pending' },
    { id: 'fix-coil', label: 'Auto-fix Coil if score < 7', detail: 'Apply AI-suggested fixes for top issues', status: 'pending' },
    { id: 'fix-base', label: 'Auto-fix Base if score < 7', detail: 'Apply AI-suggested fixes for top issues', status: 'pending' },
    { id: 'story', label: 'Generate marketing story', detail: 'GPT-4o-mini writes a 2–3 sentence brand story', status: 'pending' },
    { id: 'review', label: 'Persona review', detail: 'Fan + Taste-Maker AI personas score the design', status: 'pending' },
  ];
}

// ----------------------------------------------------------------
// Step helpers — small wrappers around existing endpoints
// ----------------------------------------------------------------
async function generateImage(
  prompt: string,
  size: string,
  apiKey: string,
  complexityLevel?: number,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt, apiKey, size, model: 'openai', quality: 'medium', complexityLevel,
      }),
    });
    const data = await safeJsonResponse(res);
    if (!res.ok || !data.imageUrl) return { ok: false, error: (data.error as string) || 'Generation failed' };
    return { ok: true, url: data.imageUrl as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

async function scoreImage(
  imageUrl: string,
  apiKey: string,
): Promise<{ score: number; issues: string[]; strengths: string[] } | null> {
  try {
    const res = await fetch('/api/etching-score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, apiKey }),
    });
    const data = await safeJsonResponse(res);
    if (!res.ok) return null;
    return {
      score: (data.score as number) || 0,
      issues: (data.issues as string[]) || [],
      strengths: (data.strengths as string[]) || [],
    };
  } catch {
    return null;
  }
}

async function autoFixImage(
  imageUrl: string,
  issues: string[],
  apiKey: string,
): Promise<{ ok: boolean; url?: string; prompt?: string; error?: string }> {
  try {
    const editPrompt =
      'Fix these production issues while preserving the design as closely as possible: ' +
      issues.slice(0, 3).join(' · ');
    const res = await fetch('/api/edit-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageUrl,
        editPrompt,
        apiKey,
        size: '1024x1024',
        strength: 'medium',
        preserveComposition: true,
        preserveSubject: true,
        folder: 'auto-pilot-fix',
        filename: `autopilot-${Date.now()}`,
      }),
    });
    const data = await safeJsonResponse(res);
    if (!res.ok || !data.url) return { ok: false, error: (data.error as string) || 'Auto-fix failed' };
    return { ok: true, url: data.url as string, prompt: (data.prompt as string) || editPrompt };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

async function generateStory(
  concept: Concept,
  apiKey: string,
): Promise<{ ok: boolean; story?: string; error?: string }> {
  try {
    const res = await fetch('/api/generate-story', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conceptName: concept.name,
        description: concept.description,
        style: concept.specs.designStyleName,
        theme: concept.specs.designTheme,
        tags: concept.tags,
        audience: concept.intendedAudience,
        apiKey,
      }),
    });
    const data = await safeJsonResponse(res);
    if (!res.ok || !data.story) return { ok: false, error: (data.error as string) || 'Story failed' };
    return { ok: true, story: data.story as string };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}
