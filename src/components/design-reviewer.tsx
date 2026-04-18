'use client';

import { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

interface ReviewResult {
  score: number;
  comment: string;
  error?: string;
}

interface Reviews {
  fan?: ReviewResult;
  skeptic?: ReviewResult;
  personas?: {
    fan: { name: string; label: string; description: string };
    skeptic: { name: string; label: string; description: string };
  };
}

interface DesignReviewerProps {
  name?: string;
  description?: string;
  style?: string;
  theme?: string;
  tags?: string[];
  coilImageUrl?: string;
  baseImageUrl?: string;
  // Compact mode for use inside modals
  compact?: boolean;
}

function scoreColor(score: number): string {
  if (score >= 8) return 'text-green-700 bg-green-50 border-green-200';
  if (score >= 6) return 'text-blue-700 bg-blue-50 border-blue-200';
  if (score >= 4) return 'text-amber-700 bg-amber-50 border-amber-200';
  return 'text-red-700 bg-red-50 border-red-200';
}

function scoreBadgeColor(score: number): string {
  if (score >= 8) return 'bg-green-600 text-white';
  if (score >= 6) return 'bg-blue-600 text-white';
  if (score >= 4) return 'bg-amber-500 text-white';
  return 'bg-red-600 text-white';
}

export function DesignReviewer(props: DesignReviewerProps) {
  const { openAIKey } = useAppStore();
  const { toast } = useToast();
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hasContent = !!(
    props.coilImageUrl || props.baseImageUrl || props.description || props.name
  );

  const run = async () => {
    if (!openAIKey) {
      setError('Set your OpenAI API key in Settings first.');
      return;
    }
    if (!hasContent) {
      setError('Nothing to review yet.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/review-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: openAIKey,
          name: props.name,
          description: props.description,
          style: props.style,
          theme: props.theme,
          tags: props.tags,
          coilImageUrl: props.coilImageUrl,
          baseImageUrl: props.baseImageUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Review failed');
        return;
      }
      setReviews(data);
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  const padding = props.compact ? 'p-3' : 'p-4';

  return (
    <div className={`bg-surface border border-border rounded-xl ${padding} space-y-3`}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <span>🗣️</span>
            Persona Reviewers
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Two personas score this design 1–10 based on their taste
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading || !hasContent}
          className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg disabled:opacity-50 transition-colors flex items-center gap-1.5"
        >
          {loading ? (
            <>
              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Reviewing…
            </>
          ) : reviews ? (
            '↻ Re-review'
          ) : (
            '✦ Get Feedback'
          )}
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-xs text-red-700">{error}</div>
      )}

      {!reviews && !loading && !error && (
        <p className="text-xs text-muted italic">
          Click &quot;Get Feedback&quot; to have The Fan and The Skeptic score this design.
        </p>
      )}

      {reviews && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* The Fan */}
          <div className={`border rounded-lg p-3 ${reviews.fan?.error ? 'border-red-200 bg-red-50' : scoreColor(reviews.fan?.score || 0)}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  The Fan
                </div>
                <div className="text-xs font-medium truncate">
                  {reviews.personas?.fan.name || 'Jake Morales'}
                </div>
              </div>
              {reviews.fan && !reviews.fan.error && (
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${scoreBadgeColor(reviews.fan.score)}`}>
                  {reviews.fan.score}
                </div>
              )}
            </div>
            <p className="text-xs leading-relaxed">
              {reviews.fan?.error ? (
                <span className="italic opacity-70">Couldn&apos;t get feedback: {reviews.fan.error}</span>
              ) : (
                `"${reviews.fan?.comment || ''}"`
              )}
            </p>
          </div>

          {/* The Skeptic */}
          <div className={`border rounded-lg p-3 ${reviews.skeptic?.error ? 'border-red-200 bg-red-50' : scoreColor(reviews.skeptic?.score || 0)}`}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
                  The Skeptic
                </div>
                <div className="text-xs font-medium truncate">
                  {reviews.personas?.skeptic.name || 'Sam Chen'}
                </div>
              </div>
              {reviews.skeptic && !reviews.skeptic.error && (
                <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${scoreBadgeColor(reviews.skeptic.score)}`}>
                  {reviews.skeptic.score}
                </div>
              )}
            </div>
            <p className="text-xs leading-relaxed">
              {reviews.skeptic?.error ? (
                <span className="italic opacity-70">Couldn&apos;t get feedback: {reviews.skeptic.error}</span>
              ) : (
                `"${reviews.skeptic?.comment || ''}"`
              )}
            </p>
          </div>
        </div>
      )}

      {reviews && reviews.fan?.score && reviews.skeptic?.score && (
        <div className="pt-2 border-t border-border flex items-center justify-between text-xs">
          <span className="text-muted">Combined score</span>
          <span className="font-semibold">
            {((reviews.fan.score + reviews.skeptic.score) / 2).toFixed(1)} / 10
          </span>
        </div>
      )}
    </div>
  );
}
