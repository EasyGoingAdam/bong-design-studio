'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

interface Score {
  score: number;
  issues: string[];
  strengths: string[];
}

interface Props {
  imageUrl: string;
  label: string;
}

/**
 * On-demand laser-etching viability score for a generated image.
 * Calls /api/etching-score (GPT-4o-mini vision) and renders a compact
 * score pill with expandable issues + strengths.
 */
export function EtchingScoreBadge({ imageUrl, label }: Props) {
  const { openAIKey } = useAppStore();
  const { toast } = useToast();
  const [score, setScore] = useState<Score | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (!imageUrl || imageUrl.startsWith('data:')) {
    // Can't score data URIs — OpenAI vision needs a public URL
    return null;
  }

  const run = async () => {
    if (!openAIKey) {
      toast('Set your OpenAI API key in Settings first', 'error');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/etching-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, apiKey: openAIKey }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || 'Score failed', 'error');
        return;
      }
      setScore(data);
      setExpanded(true);
    } catch {
      toast('Network error — try again', 'error');
    } finally {
      setLoading(false);
    }
  };

  const colorFor = (n: number) => {
    if (n >= 8) return 'bg-green-100 text-green-800 border-green-300';
    if (n >= 5) return 'bg-amber-100 text-amber-800 border-amber-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const labelFor = (n: number) => {
    if (n >= 9) return 'Production-ready';
    if (n >= 7) return 'Minor fixes';
    if (n >= 5) return 'Needs work';
    if (n >= 3) return 'Major issues';
    return 'Not viable';
  };

  if (!score) {
    return (
      <button
        onClick={run}
        disabled={loading}
        className="text-[10px] px-2 py-1 rounded border border-border text-muted hover:text-foreground hover:border-accent/60 transition-colors disabled:opacity-50"
        title={`AI-check ${label} etching viability`}
      >
        {loading ? 'Checking…' : '✦ Etch score'}
      </button>
    );
  }

  return (
    <div className="text-[10px]">
      <button
        onClick={() => setExpanded((v) => !v)}
        className={`inline-flex items-center gap-1.5 px-2 py-1 rounded border ${colorFor(score.score)} font-medium`}
      >
        <span className="font-bold">{score.score}/10</span>
        <span>{labelFor(score.score)}</span>
        <span className="opacity-60">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1.5 text-[10px] leading-snug">
          {score.strengths.length > 0 && (
            <div>
              <div className="font-medium text-green-700 mb-0.5">✓ Strengths</div>
              <ul className="space-y-0.5 pl-3">
                {score.strengths.map((s, i) => (
                  <li key={i} className="text-muted list-disc">{s}</li>
                ))}
              </ul>
            </div>
          )}
          {score.issues.length > 0 && (
            <div>
              <div className="font-medium text-red-700 mb-0.5">⚠ Issues</div>
              <ul className="space-y-0.5 pl-3">
                {score.issues.map((s, i) => (
                  <li key={i} className="text-muted list-disc">{s}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={run}
            disabled={loading}
            className="text-muted hover:text-foreground underline"
          >
            {loading ? 'Re-checking…' : 'Re-check'}
          </button>
        </div>
      )}
    </div>
  );
}
