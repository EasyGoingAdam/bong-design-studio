'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

interface ProviderResult {
  url: string;
  elapsedMs: number;
  score: number | null;
  issues: string[];
  strengths: string[];
  scoring: boolean;
  error?: string;
}

interface BenchmarkResults {
  prompt: string;
  openai: ProviderResult | null;
  gemini: ProviderResult | null;
  complexityLevel: number;
}

const SAMPLE_PROMPTS = [
  {
    label: 'Sacred Geometry',
    prompt: 'Black and white sacred geometry mandala for laser etching on glass. Flower of life pattern with concentric geometric borders. Pure black on pure white. No gradients.',
  },
  {
    label: 'Botanical Nouveau',
    prompt: 'Art Nouveau botanical design for laser etch. Stylized iris flower with curving whiplash stems. Solid black on white. Bold line hierarchy, no shading.',
  },
  {
    label: 'Mountain Topography',
    prompt: 'Topographic mountain silhouette for laser etching. Single iconic peak with concentric contour lines radiating outward. Pure black and white, clean line weight.',
  },
  {
    label: 'Moon Phases',
    prompt: 'Celestial moon phases for laser etch. Crescent, half, full, and gibbous moons with star accents. Bold silhouettes, pure black on white, no gradients.',
  },
];

/**
 * Admin benchmark tool: runs the same prompt through BOTH OpenAI and Gemini
 * in parallel, then scores each output via the etching-score endpoint.
 *
 * Useful for:
 *   - Deciding which provider to default to
 *   - Validating the Gemini tuning layer's effectiveness
 *   - Spotting regressions when either provider's model changes
 */
export function BenchmarkDashboard() {
  const { openAIKey, geminiKey } = useAppStore();
  const { toast } = useToast();

  const [prompt, setPrompt] = useState('');
  const [complexityLevel, setComplexityLevel] = useState(3);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<BenchmarkResults | null>(null);

  const canRun = !!prompt.trim() && !!openAIKey && !!geminiKey && !running;

  const scoreOne = async (provider: 'openai' | 'gemini', url: string): Promise<{ score: number; issues: string[]; strengths: string[] } | { error: string }> => {
    try {
      const res = await fetch('/api/etching-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: url, apiKey: openAIKey }),
      });
      const data = await res.json();
      if (!res.ok) return { error: data.error || 'Scoring failed' };
      return { score: data.score, issues: data.issues || [], strengths: data.strengths || [] };
    } catch {
      console.warn(`[benchmark] score failed for ${provider}`);
      return { error: 'Network error' };
    }
  };

  const generateOne = async (provider: 'openai' | 'gemini'): Promise<ProviderResult> => {
    const started = Date.now();
    try {
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          apiKey: openAIKey,
          geminiKey,
          model: provider,
          size: '1024x1024',
          quality: 'medium',
          folder: 'benchmark',
          filename: `benchmark-${provider}-${Date.now()}`,
          complexityLevel,
        }),
      });
      const data = await res.json();
      const elapsedMs = Date.now() - started;
      if (!res.ok) {
        return { url: '', elapsedMs, score: null, issues: [], strengths: [], scoring: false, error: data.error || `${provider} error ${res.status}` };
      }
      return { url: data.imageUrl, elapsedMs, score: null, issues: [], strengths: [], scoring: true };
    } catch (err) {
      return {
        url: '',
        elapsedMs: Date.now() - started,
        score: null,
        issues: [],
        strengths: [],
        scoring: false,
        error: err instanceof Error ? err.message : 'Network error',
      };
    }
  };

  const run = async () => {
    if (!prompt.trim()) return;
    setRunning(true);
    setResults({ prompt: prompt.trim(), openai: null, gemini: null, complexityLevel });

    // Fire both providers in parallel
    const [openai, gemini] = await Promise.all([generateOne('openai'), generateOne('gemini')]);
    setResults((prev) => ({ ...prev!, openai, gemini }));

    // Score each in parallel (only if the image uploaded successfully as a real URL)
    const scoreJobs: Promise<void>[] = [];
    if (openai.url && !openai.url.startsWith('data:')) {
      scoreJobs.push(
        scoreOne('openai', openai.url).then((r) => {
          setResults((prev) => {
            if (!prev) return prev;
            const updated = { ...prev.openai! };
            if ('error' in r) {
              updated.error = updated.error || r.error;
            } else {
              updated.score = r.score;
              updated.issues = r.issues;
              updated.strengths = r.strengths;
            }
            updated.scoring = false;
            return { ...prev, openai: updated };
          });
        })
      );
    }
    if (gemini.url && !gemini.url.startsWith('data:')) {
      scoreJobs.push(
        scoreOne('gemini', gemini.url).then((r) => {
          setResults((prev) => {
            if (!prev) return prev;
            const updated = { ...prev.gemini! };
            if ('error' in r) {
              updated.error = updated.error || r.error;
            } else {
              updated.score = r.score;
              updated.issues = r.issues;
              updated.strengths = r.strengths;
            }
            updated.scoring = false;
            return { ...prev, gemini: updated };
          });
        })
      );
    }
    await Promise.all(scoreJobs);
    setRunning(false);
    toast('Benchmark complete', 'success');
  };

  const winner = (() => {
    if (!results?.openai?.score || !results?.gemini?.score) return null;
    if (results.openai.score > results.gemini.score) return 'openai';
    if (results.gemini.score > results.openai.score) return 'gemini';
    return 'tie';
  })();

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">Benchmark</h2>
        <p className="text-sm text-muted">
          Run the same prompt through OpenAI <code className="text-xs">gpt-image-1</code> and Google <code className="text-xs">gemini-2.5-flash-image</code> side-by-side. Each output is auto-graded by GPT-4o-mini for laser-etching viability.
        </p>
      </div>

      {(!openAIKey || !geminiKey) && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-xs text-amber-800">
          {!openAIKey && <div>⚠ OpenAI API key missing — set it in Settings.</div>}
          {!geminiKey && <div>⚠ Gemini API key missing — set it in Settings.</div>}
        </div>
      )}

      {/* Prompt input */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-5 space-y-3">
        <div>
          <label className="block text-xs font-medium mb-1.5">Prompt</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="e.g. Black and white sacred geometry mandala for laser etch on glass…"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
          />
          <div className="mt-1.5 flex flex-wrap gap-1">
            <span className="text-[10px] text-muted">Samples:</span>
            {SAMPLE_PROMPTS.map((s) => (
              <button
                key={s.label}
                onClick={() => setPrompt(s.prompt)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted hover:text-foreground hover:border-accent/60 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-32">
            <label className="block text-xs font-medium mb-1.5">Complexity</label>
            <select
              value={complexityLevel}
              onChange={(e) => setComplexityLevel(Number(e.target.value))}
              className="w-full bg-background border border-border rounded-lg px-2 py-2 text-sm focus:outline-none focus:border-accent"
            >
              <option value={1}>1 (simple)</option>
              <option value={2}>2</option>
              <option value={3}>3</option>
              <option value={4}>4</option>
              <option value={5}>5 (intricate)</option>
            </select>
          </div>
          <button
            onClick={run}
            disabled={!canRun}
            className="flex-1 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {running ? 'Generating + scoring both providers…' : '✦ Run Benchmark'}
          </button>
        </div>
      </div>

      {/* Results */}
      {results && (
        <>
          {/* Winner banner */}
          {winner && (
            <div
              className={`rounded-lg p-3 mb-4 text-sm font-medium ${
                winner === 'tie'
                  ? 'bg-blue-50 border border-blue-200 text-blue-800'
                  : winner === 'openai'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-purple-50 border border-purple-200 text-purple-800'
              }`}
            >
              {winner === 'tie' && '🤝 Tie — both providers scored the same for this prompt.'}
              {winner === 'openai' && `🏆 OpenAI wins by ${(results.openai!.score! - results.gemini!.score!)} point${Math.abs(results.openai!.score! - results.gemini!.score!) > 1 ? 's' : ''} (${results.openai!.score}/10 vs ${results.gemini!.score}/10).`}
              {winner === 'gemini' && `🏆 Gemini wins by ${(results.gemini!.score! - results.openai!.score!)} point${Math.abs(results.gemini!.score! - results.openai!.score!) > 1 ? 's' : ''} (${results.gemini!.score}/10 vs ${results.openai!.score}/10).`}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ProviderCard name="OpenAI" sub="gpt-image-1" result={results.openai} />
            <ProviderCard name="Gemini" sub="gemini-2.5-flash-image" result={results.gemini} accent="purple" />
          </div>
        </>
      )}
    </div>
  );
}

function ProviderCard({
  name,
  sub,
  result,
  accent = 'emerald',
}: {
  name: string;
  sub: string;
  result: ProviderResult | null;
  accent?: 'emerald' | 'purple';
}) {
  const accentClass = accent === 'purple' ? 'border-purple-300 bg-purple-50/30' : 'border-emerald-300 bg-emerald-50/30';

  return (
    <div className={`bg-surface border-2 ${accentClass} rounded-xl overflow-hidden`}>
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold">{name}</h3>
          <p className="text-[10px] text-muted font-mono">{sub}</p>
        </div>
        {result && (
          <div className="text-right">
            {result.score !== null ? (
              <div className="text-2xl font-bold">{result.score}<span className="text-sm text-muted">/10</span></div>
            ) : result.scoring ? (
              <span className="text-xs text-muted">Scoring…</span>
            ) : result.error ? (
              <span className="text-xs text-red-700">Error</span>
            ) : null}
            <div className="text-[10px] text-muted">{(result.elapsedMs / 1000).toFixed(1)}s</div>
          </div>
        )}
      </div>

      <div className="aspect-square bg-background placeholder-pattern flex items-center justify-center">
        {!result ? (
          <div className="flex flex-col items-center gap-2 text-muted">
            <span className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            <span className="text-xs">Generating…</span>
          </div>
        ) : result.error ? (
          <div className="text-xs text-red-700 p-4 text-center">{result.error}</div>
        ) : result.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.url} alt={`${name} output`} className="w-full h-full object-contain" />
        ) : (
          <span className="text-xs text-muted">No image</span>
        )}
      </div>

      {result && (result.strengths.length > 0 || result.issues.length > 0) && (
        <div className="p-3 space-y-2 text-[11px]">
          {result.strengths.length > 0 && (
            <div>
              <div className="font-semibold text-green-700 mb-0.5">✓ Strengths</div>
              <ul className="space-y-0.5 pl-3">
                {result.strengths.map((s, i) => (
                  <li key={i} className="text-muted list-disc leading-snug">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {result.issues.length > 0 && (
            <div>
              <div className="font-semibold text-red-700 mb-0.5">⚠ Issues</div>
              <ul className="space-y-0.5 pl-3">
                {result.issues.map((s, i) => (
                  <li key={i} className="text-muted list-disc leading-snug">{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
