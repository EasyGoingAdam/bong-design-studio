'use client';

import { useMemo, useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAppStore } from '@/lib/store';
import { Concept, STATUS_LABELS } from '@/lib/types';
import { StatusBadge, PriorityBadge } from './ui';

const MAX_COMPARE = 4;

/**
 * Side-by-side comparison of 2-4 concepts. Concept IDs are pulled from the
 * URL search-params (?ids=a,b,c) so a comparison view is shareable via link.
 */
export function CompareView({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { concepts } = useAppStore();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  const ids = useMemo(() => {
    const raw = searchParams.get('ids') || '';
    return raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, MAX_COMPARE);
  }, [searchParams]);

  const compared = useMemo(
    () => ids.map((id) => concepts.find((c) => c.id === id)).filter((c): c is Concept => !!c),
    [ids, concepts]
  );

  const updateIds = (newIds: string[]) => {
    const params = new URLSearchParams(searchParams.toString());
    if (newIds.length) params.set('ids', newIds.join(','));
    else params.delete('ids');
    router.push(`/compare?${params.toString()}`);
  };

  const removeId = (id: string) => updateIds(ids.filter((i) => i !== id));
  const addId = (id: string) => {
    if (ids.includes(id) || ids.length >= MAX_COMPARE) return;
    updateIds([...ids, id]);
    setPickerOpen(false);
  };

  // Available concepts (not yet in the comparison)
  const candidates = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return concepts
      .filter((c) => !ids.includes(c.id))
      .filter((c) => !q || c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q)))
      .slice(0, 30);
  }, [concepts, ids, pickerSearch]);

  // ESC closes picker
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPickerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pickerOpen]);

  if (compared.length === 0) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="eyebrow mb-1">Side-by-side</div>
        <h2 className="display-sm">Compare</h2>
        <p className="text-sm text-muted mt-1 mb-6">
          Pick 2–{MAX_COMPARE} concepts to compare them across images, status, tags, and AI iteration count.
        </p>
        <div className="bg-surface border border-dashed border-border rounded-xl p-10 text-center">
          <div className="text-5xl mb-4 opacity-30">⊞</div>
          <h3 className="serif text-xl font-medium mb-2">Nothing selected yet</h3>
          <p className="text-sm text-muted max-w-md mx-auto mb-5">
            Add concepts via the picker below, or pass them in the URL: <span className="mono">/compare?ids=&lt;id1&gt;,&lt;id2&gt;</span>
          </p>
          <button
            onClick={() => setPickerOpen(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors"
          >
            + Add concept
          </button>
        </div>
        {pickerOpen && (
          <Picker
            search={pickerSearch}
            setSearch={setPickerSearch}
            candidates={candidates}
            onPick={addId}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <div className="eyebrow mb-1">Side-by-side</div>
          <h2 className="display-sm">Compare</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Comparing {compared.length} of {MAX_COMPARE} possible concepts.
          </p>
        </div>
        <div className="flex gap-2">
          {compared.length < MAX_COMPARE && (
            <button
              onClick={() => setPickerOpen(true)}
              className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg hover:border-border-light"
            >
              + Add concept
            </button>
          )}
          <button
            onClick={() => updateIds([])}
            className="px-3 py-1.5 text-sm text-muted hover:text-foreground"
          >
            Clear all
          </button>
        </div>
      </div>

      {/* Comparison grid */}
      <div
        className="grid gap-4 overflow-x-auto pb-4"
        style={{
          gridTemplateColumns: `repeat(${compared.length}, minmax(260px, 1fr))`,
        }}
      >
        {compared.map((c) => (
          <ConceptColumn
            key={c.id}
            concept={c}
            onOpen={() => onOpenConcept(c.id)}
            onRemove={() => removeId(c.id)}
          />
        ))}
      </div>

      {pickerOpen && (
        <Picker
          search={pickerSearch}
          setSearch={setPickerSearch}
          candidates={candidates}
          onPick={addId}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

/* ───────────── Subcomponents ───────────── */

function ConceptColumn({
  concept: c, onOpen, onRemove,
}: { concept: Concept; onOpen: () => void; onRemove: () => void }) {
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      {/* Image */}
      <div className="aspect-square bg-background placeholder-pattern relative">
        {c.coilImageUrl || c.baseImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={c.combinedImageUrl || c.coilImageUrl || c.baseImageUrl}
            alt={c.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted text-xs">No image</div>
        )}
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-6 h-6 rounded-full bg-foreground/80 text-surface text-xs hover:bg-foreground"
          title="Remove from comparison"
        >
          ×
        </button>
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <button onClick={onOpen} className="text-left mb-3">
          <h3 className="serif text-lg font-medium leading-tight hover:text-accent transition-colors">
            {c.name}
          </h3>
          {c.collection && <div className="eyebrow mt-1">{c.collection}</div>}
        </button>

        <div className="flex flex-wrap gap-1.5 mb-3">
          <StatusBadge status={c.status} />
          <PriorityBadge priority={c.priority} />
        </div>

        {/* Stat rows */}
        <dl className="space-y-1.5 text-xs mb-3">
          <Row label="Designer" value={c.designer || '—'} />
          <Row label="Lifecycle" value={c.lifecycleType.replace('_', ' ')} />
          <Row label="Versions" value={c.versions.length} />
          <Row label="AI gens" value={c.aiGenerations.length} />
          <Row label="Comments" value={c.comments.length} />
          <Row label="Created" value={new Date(c.createdAt).toLocaleDateString()} />
          <Row label="Updated" value={new Date(c.updatedAt).toLocaleDateString()} />
        </dl>

        {c.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {c.tags.slice(0, 6).map((t) => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted">{t}</span>
            ))}
            {c.tags.length > 6 && <span className="text-[10px] text-muted">+{c.tags.length - 6}</span>}
          </div>
        )}

        {c.description && (
          <p className="text-xs text-muted line-clamp-4 mb-3">{c.description}</p>
        )}

        <button
          onClick={onOpen}
          className="mt-auto text-xs px-3 py-2 bg-foreground text-surface rounded-lg hover:bg-accent transition-colors font-medium"
        >
          Open detail →
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-foreground tabular-nums truncate">{value}</dd>
    </div>
  );
}

function Picker({
  search, setSearch, candidates, onPick, onClose,
}: {
  search: string;
  setSearch: (v: string) => void;
  candidates: Concept[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="serif text-lg font-medium">Add a concept</h3>
            <button onClick={onClose} className="text-muted hover:text-foreground text-lg">×</button>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or tag…"
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
            autoFocus
          />
        </div>
        <div className="p-2">
          {candidates.length === 0 ? (
            <div className="text-center text-sm text-muted py-8">No matches.</div>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover text-left"
              >
                <div className="w-10 h-10 rounded bg-background placeholder-pattern shrink-0 overflow-hidden">
                  {c.coilImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coilImageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted truncate">{STATUS_LABELS[c.status]} · {c.collection || 'no collection'}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
