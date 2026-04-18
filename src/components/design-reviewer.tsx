'use client';

import { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { PersonaReview, PersonaReviewsCache } from '@/lib/types';
import { formatDateTime } from '@/lib/utils';

interface Reviews {
  fan: PersonaReview;
  skeptic: PersonaReview;
  reviewedAt?: string;
  manufacturedCount?: number;
  personas?: {
    fan: { name: string; label: string; description: string };
    skeptic: { name: string; label: string; description: string };
  };
}

interface DesignReviewerProps {
  conceptId?: string;
  name?: string;
  description?: string;
  style?: string;
  theme?: string;
  tags?: string[];
  coilImageUrl?: string;
  baseImageUrl?: string;
  /**
   * If provided and its fingerprint matches the current images, skip the API call
   * and display these cached reviews. Used to avoid re-reviewing unchanged designs.
   */
  cachedReviews?: PersonaReviewsCache;
}

function fingerprint(coil?: string, base?: string): string {
  return [coil || '', base || ''].join('|');
}

function scoreBg(score: number): string {
  if (score >= 8) return 'bg-green-600';
  if (score >= 6) return 'bg-blue-600';
  if (score >= 4) return 'bg-amber-500';
  return 'bg-red-600';
}

function scoreBorder(score: number): string {
  if (score >= 8) return 'border-green-200 bg-green-50';
  if (score >= 6) return 'border-blue-200 bg-blue-50';
  if (score >= 4) return 'border-amber-200 bg-amber-50';
  return 'border-red-200 bg-red-50';
}

function PersonaRow({
  review,
  label,
  personaName,
  similarTo,
}: {
  review: PersonaReview;
  label: string;
  personaName: string;
  similarTo?: string;
}) {
  if (review.error) {
    return (
      <div className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
        <div className="font-semibold">{label}</div>
        <div className="italic opacity-80 mt-0.5">{review.error}</div>
      </div>
    );
  }

  const recs = review.recommendations || [];

  return (
    <div className={`border rounded-lg p-2 ${scoreBorder(review.score)}`}>
      <div className="flex items-start gap-2">
        <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white ${scoreBg(review.score)}`}>
          {review.score}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">
              {label}
            </span>
            <span className="text-[9px] opacity-50 truncate">{personaName}</span>
          </div>
          <p className="text-[11px] leading-snug mt-0.5 text-foreground/90">&quot;{review.comment}&quot;</p>

          {recs.length > 0 && (
            <div className="mt-1.5 pt-1.5 border-t border-current/10">
              <div className="text-[9px] font-semibold uppercase tracking-wider opacity-60 mb-1">
                Recommendations
              </div>
              <ul className="space-y-0.5">
                {recs.map((rec, i) => (
                  <li key={i} className="text-[11px] leading-snug text-foreground/85 flex gap-1.5">
                    <span className="opacity-60 shrink-0">→</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {similarTo && (
            <div className="mt-1.5 text-[10px] text-amber-800 bg-amber-100/70 border border-amber-200 rounded px-1.5 py-0.5 inline-block">
              Similar to: <span className="font-semibold">{similarTo}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DesignReviewer(props: DesignReviewerProps) {
  const { openAIKey } = useAppStore();
  const [reviews, setReviews] = useState<Reviews | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Track the fingerprint we've already reviewed to avoid duplicates
  const reviewedFingerprintRef = useRef<string>('');

  const currentFingerprint = fingerprint(props.coilImageUrl, props.baseImageUrl);
  const hasContent = !!(props.coilImageUrl || props.baseImageUrl);

  // Hydrate from cached reviews if their fingerprint matches current images
  useEffect(() => {
    if (
      props.cachedReviews &&
      props.cachedReviews.fingerprint === currentFingerprint &&
      props.cachedReviews.fan &&
      props.cachedReviews.skeptic
    ) {
      setReviews({
        fan: props.cachedReviews.fan,
        skeptic: props.cachedReviews.skeptic,
        reviewedAt: props.cachedReviews.reviewedAt,
        manufacturedCount: props.cachedReviews.manufacturedCount,
      });
      reviewedFingerprintRef.current = currentFingerprint;
    }
  }, [props.cachedReviews, currentFingerprint]);

  // Auto-fetch reviews when images change (or on mount if no cache matches)
  useEffect(() => {
    if (!hasContent || !openAIKey) return;
    if (reviewedFingerprintRef.current === currentFingerprint) return; // already reviewed this exact pair

    // If cachedReviews matches the current fingerprint, skip
    if (
      props.cachedReviews &&
      props.cachedReviews.fingerprint === currentFingerprint
    ) {
      reviewedFingerprintRef.current = currentFingerprint;
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/review-design', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: openAIKey,
            conceptId: props.conceptId,
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
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || 'Review failed');
          return;
        }
        setReviews(data);
        reviewedFingerprintRef.current = currentFingerprint;
      } catch {
        if (!cancelled) setError('Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFingerprint, openAIKey, hasContent]);

  const rerun = async () => {
    reviewedFingerprintRef.current = ''; // force a re-review
    setReviews(null);
    // Trigger useEffect by changing a dependency — just flip loading briefly
    setLoading(true);
    try {
      const res = await fetch('/api/review-design', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: openAIKey,
          conceptId: props.conceptId,
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
      if (!res.ok) { setError(data.error || 'Review failed'); return; }
      setReviews(data);
      reviewedFingerprintRef.current = currentFingerprint;
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  if (!hasContent) return null;

  return (
    <div className="bg-surface border border-border rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold flex items-center gap-1.5">
            <span>🗣️</span>
            Persona Feedback
          </h3>
          {reviews?.reviewedAt && (
            <div className="text-[10px] text-muted mt-0.5">
              {formatDateTime(reviews.reviewedAt)}
              {reviews.manufacturedCount !== undefined && reviews.manufacturedCount > 0 && (
                <span className="ml-1 opacity-70">· compared vs {reviews.manufacturedCount} manufactured</span>
              )}
            </div>
          )}
        </div>
        {reviews && !loading && (
          <button
            onClick={rerun}
            className="text-[10px] text-muted hover:text-foreground px-1.5 py-0.5 rounded hover:bg-surface-hover transition-colors"
            title="Re-run review"
          >
            ↻
          </button>
        )}
      </div>

      {loading && !reviews && (
        <div className="flex items-center gap-2 py-2 text-[11px] text-muted">
          <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          Getting persona feedback…
        </div>
      )}

      {error && !loading && (
        <div className="text-[10px] text-red-700 bg-red-50 border border-red-200 rounded p-1.5">
          {error}
        </div>
      )}

      {reviews && (
        <div className="space-y-2">
          <PersonaRow
            review={reviews.fan}
            label="The Fan"
            personaName={reviews.personas?.fan.name || 'Jake Morales'}
            similarTo={reviews.fan.similarTo}
          />
          <PersonaRow
            review={reviews.skeptic}
            label="The Skeptic"
            personaName={reviews.personas?.skeptic.name || 'Sam Chen'}
            similarTo={reviews.skeptic.similarTo}
          />

          {reviews.fan.score > 0 && reviews.skeptic.score > 0 && (
            <div className="flex items-center justify-between text-[10px] pt-1 border-t border-border/60">
              <span className="text-muted">Combined</span>
              <span className="font-semibold">
                {((reviews.fan.score + reviews.skeptic.score) / 2).toFixed(1)} / 10
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
