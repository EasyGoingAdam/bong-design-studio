'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept, STATUS_LABELS } from '@/lib/types';
import { MockupComposer } from './mockup-composer';

type Filter = 'all' | 'with_mockup' | 'without_mockup' | 'ready_to_mockup';

/**
 * Mockup Studio — browse concepts and render photorealistic product mockups
 * for each. A concept is "ready to mockup" once it has a generated coil
 * design (you can't paste a design onto a product if you haven't designed
 * the design yet).
 */
export function MockupStudio() {
  const { concepts } = useAppStore();
  const [active, setActive] = useState<Concept | null>(null);
  const [filter, setFilter] = useState<Filter>('ready_to_mockup');
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return concepts
      .filter((c) => {
        if (filter === 'all') return true;
        if (filter === 'with_mockup') return !!c.productMockupUrl;
        if (filter === 'without_mockup') return !c.productMockupUrl;
        if (filter === 'ready_to_mockup') return !!c.coilImageUrl;
        return true;
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
    const withMockup = concepts.filter((c) => c.productMockupUrl).length;
    const readyToMockup = concepts.filter((c) => c.coilImageUrl).length;
    const pending = concepts.filter((c) => c.coilImageUrl && !c.productMockupUrl).length;
    return { withMockup, readyToMockup, pending };
  }, [concepts]);

  return (
    <div className="p-6">
      <div className="mb-5">
        <h2 className="text-2xl font-bold">Mockup Studio</h2>
        <p className="text-sm text-muted">
          Upload a blank unit and OpenAI gpt-image-1 renders the etched design onto every side of the product. Every render is automatically critiqued and can be auto-fixed.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted uppercase tracking-wider">Ready to mockup</div>
          <div className="text-2xl font-bold mt-0.5">{stats.readyToMockup}</div>
          <div className="text-[10px] text-muted">concepts have coil designs</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted uppercase tracking-wider">Mockups rendered</div>
          <div className="text-2xl font-bold mt-0.5 text-green-700">{stats.withMockup}</div>
          <div className="text-[10px] text-muted">product mockup saved</div>
        </div>
        <div className="bg-surface border border-border rounded-xl p-3">
          <div className="text-[11px] text-muted uppercase tracking-wider">Pending</div>
          <div className="text-2xl font-bold mt-0.5 text-amber-700">{stats.pending}</div>
          <div className="text-[10px] text-muted">ready but not yet rendered</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="flex gap-1 bg-surface border border-border rounded-lg p-0.5">
          {([
            { id: 'ready_to_mockup', label: 'Ready to mockup' },
            { id: 'without_mockup', label: 'Needs mockup' },
            { id: 'with_mockup', label: 'Has mockup' },
            { id: 'all', label: 'All' },
          ] as { id: Filter; label: string }[]).map((f) => (
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

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-muted">
          {filter === 'ready_to_mockup'
            ? 'No concepts have coil designs yet. Generate a coil design from any concept detail page, then return here to render it on the product.'
            : 'No concepts match your filter.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <MockupCard key={c.id} concept={c} onOpen={() => setActive(c)} />
          ))}
        </div>
      )}

      {active && <MockupComposer concept={active} onClose={() => setActive(null)} />}
    </div>
  );
}

function MockupCard({ concept, onOpen }: { concept: Concept; onOpen: () => void }) {
  const thumb = concept.productMockupUrl || concept.coilImageUrl || concept.combinedImageUrl;
  const hasMockup = !!concept.productMockupUrl;
  const angleCount = concept.productMockupAngles?.length || 0;
  const needsCoil = !concept.coilImageUrl;

  return (
    <button
      onClick={onOpen}
      disabled={needsCoil}
      className="group bg-surface border border-border rounded-xl overflow-hidden hover:border-accent/60 transition-colors cursor-pointer flex flex-col text-left disabled:opacity-60 disabled:cursor-not-allowed"
    >
      <div className="aspect-square bg-background placeholder-pattern flex items-center justify-center relative overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={concept.name} className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-muted">No image</span>
        )}
        {hasMockup ? (
          <span className="absolute top-2 right-2 text-[10px] bg-green-600 text-white px-2 py-0.5 rounded-full font-medium">
            ✓ Mockup{angleCount > 1 ? ` × ${angleCount}` : ''}
          </span>
        ) : needsCoil ? (
          <span className="absolute top-2 right-2 text-[10px] bg-gray-500 text-white px-2 py-0.5 rounded-full font-medium">
            No coil
          </span>
        ) : (
          <span className="absolute top-2 right-2 text-[10px] bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
            Needs mockup
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
            {needsCoil ? 'Generate a coil design first' : hasMockup ? 'Click to re-render' : 'Click to create mockup'}
          </span>
          {!needsCoil && <span className="text-accent text-xs">→</span>}
        </div>
      </div>
    </button>
  );
}
