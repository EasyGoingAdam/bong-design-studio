'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept, ConceptStatus, STATUS_LABELS } from '@/lib/types';
import { MarketingComposer } from './marketing-composer';

type StatusFilter = 'all' | ConceptStatus | 'with_graphic' | 'without_graphic';

/**
 * Marketing Studio — browse concepts and compose marketing graphics for each.
 * Defaults to "Manufactured" concepts (the natural stage for marketing shots)
 * but lets users compose for any concept.
 */
export function MarketingStudio() {
  const { concepts } = useAppStore();

  const [active, setActive] = useState<Concept | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('manufactured');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return concepts
      .filter((c) => {
        if (filter === 'all') return true;
        if (filter === 'with_graphic') return !!c.marketingGraphicUrl;
        if (filter === 'without_graphic') return !c.marketingGraphicUrl;
        return c.status === filter;
      })
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          c.collection.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        );
      });
  }, [concepts, filter, search]);

  const stats = useMemo(() => {
    const withGraphic = concepts.filter((c) => c.marketingGraphicUrl).length;
    const manufactured = concepts.filter((c) => c.status === 'manufactured').length;
    const needsMarketing = concepts.filter((c) => c.status === 'manufactured' && !c.marketingGraphicUrl).length;
    return { withGraphic, manufactured, needsMarketing };
  }, [concepts]);

  return (
    <div className="p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">Marketing Studio</h2>
        <p className="text-sm text-muted">
          Upload a product photo and generate a ready-to-post marketing graphic — product name top-left, coil design badge top-right, composited on the full product image.
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted uppercase tracking-wider">Manufactured</div>
          <div className="text-2xl font-bold mt-0.5">{stats.manufactured}</div>
          <div className="text-[10px] text-muted">concepts completed</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted uppercase tracking-wider">With Marketing</div>
          <div className="text-2xl font-bold mt-0.5 text-green-700">{stats.withGraphic}</div>
          <div className="text-[10px] text-muted">graphic composed</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted uppercase tracking-wider">Needs Marketing</div>
          <div className="text-2xl font-bold mt-0.5 text-amber-700">{stats.needsMarketing}</div>
          <div className="text-[10px] text-muted">manufactured but no graphic</div>
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
          {([
            { id: 'manufactured', label: 'Manufactured' },
            { id: 'without_graphic', label: 'Needs marketing' },
            { id: 'with_graphic', label: 'Has marketing' },
            { id: 'all', label: 'All' },
          ] as { id: StatusFilter; label: string }[]).map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`text-xs px-2.5 py-1.5 rounded transition-colors ${
                filter === f.id
                  ? 'bg-accent text-white'
                  : 'text-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, collection, tag…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted">
          {filter === 'manufactured'
            ? 'No manufactured concepts yet. Move concepts to the Manufactured column on the Workflow board to see them here.'
            : 'No concepts match your filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <ConceptMarketingCard
              key={c.id}
              concept={c}
              onOpen={() => setActive(c)}
            />
          ))}
        </div>
      )}

      {active && (
        <MarketingComposer
          concept={active}
          onClose={() => setActive(null)}
        />
      )}
    </div>
  );
}

function ConceptMarketingCard({ concept, onOpen }: { concept: Concept; onOpen: () => void }) {
  const hasGraphic = !!concept.marketingGraphicUrl;
  const thumb = concept.marketingGraphicUrl || concept.coilImageUrl || concept.combinedImageUrl || concept.baseImageUrl;

  return (
    <div
      onClick={onOpen}
      className="group bg-surface border border-border rounded-xl overflow-hidden hover:border-accent/60 transition-colors cursor-pointer flex flex-col"
    >
      <div className="aspect-square bg-background placeholder-pattern flex items-center justify-center relative overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={concept.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-muted">No image</span>
        )}
        {hasGraphic ? (
          <span className="absolute top-2 right-2 text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">
            ✓ Marketing ready
          </span>
        ) : (
          <span className="absolute top-2 right-2 text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
            Needs graphic
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold truncate">{concept.name}</h3>
          <span className="text-[10px] text-muted shrink-0 capitalize">
            {STATUS_LABELS[concept.status]}
          </span>
        </div>
        {concept.collection && (
          <p className="text-[11px] text-muted truncate mt-0.5">{concept.collection}</p>
        )}
        <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
          <span className="text-[10px] text-muted">
            {hasGraphic ? 'Click to re-compose' : 'Click to compose'}
          </span>
          <span className="text-accent text-xs">→</span>
        </div>
      </div>
    </div>
  );
}
