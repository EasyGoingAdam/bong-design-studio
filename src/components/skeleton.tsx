/**
 * Skeleton primitives — placeholder UI for async-loaded surfaces. Plain
 * CSS shimmer; no animation library. Use these in place of generic
 * spinners on grids/lists so the page lays out correctly while data
 * loads (no content jump).
 *
 * Usage:
 *   {loading ? <SkeletonCardGrid count={6} /> : <Grid items={data} />}
 */

interface SkeletonProps {
  className?: string;
  style?: React.CSSProperties;
}

const SHIMMER_STYLE: React.CSSProperties = {
  backgroundImage:
    'linear-gradient(90deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.10) 50%, rgba(0,0,0,0.06) 100%)',
  backgroundSize: '200% 100%',
  animation: 'skeleton-shimmer 1.6s linear infinite',
};

/**
 * Base shimmering block. Compose larger skeletons by stacking these
 * with width/height/border-radius set via className or style.
 */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      aria-hidden
      className={`bg-background rounded ${className}`}
      style={{ ...SHIMMER_STYLE, ...style }}
    />
  );
}

/** A typical card skeleton — square image + 2 lines of text + a small footer. */
export function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-1 mt-3">
          <Skeleton className="h-4 w-12 rounded-full" />
          <Skeleton className="h-4 w-16 rounded-full" />
        </div>
      </div>
    </div>
  );
}

/** A grid of N card skeletons — drop-in replacement for an async grid. */
export function SkeletonCardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }, (_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

/** A horizontal row skeleton — for lists like Stuck Concepts. */
export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg bg-surface border border-border">
      <Skeleton className="w-10 h-10 rounded shrink-0" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-2 w-1/3" />
      </div>
    </div>
  );
}

/** CSS keyframes — injected once globally so we don't ship per-Skeleton style tags. */
export function SkeletonShimmerStyles() {
  return (
    <style jsx global>{`
      @keyframes skeleton-shimmer {
        0%   { background-position: 100% 0; }
        100% { background-position: -100% 0; }
      }
    `}</style>
  );
}
