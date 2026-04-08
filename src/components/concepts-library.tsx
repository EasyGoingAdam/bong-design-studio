'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { ConceptStatus, LifecycleType, PriorityLevel } from '@/lib/types';
import { ConceptCard } from './concept-card';
import { Select, EmptyState } from './ui';
import { NewConceptModal } from './new-concept-modal';

export function ConceptsLibrary({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts } = useAppStore();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [collectionFilter, setCollectionFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [designerFilter, setDesignerFilter] = useState('');
  const [lifecycleFilter, setLifecycleFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'name'>('updated');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showNewModal, setShowNewModal] = useState(false);

  const collections = useMemo(() =>
    [...new Set(concepts.map((c) => c.collection).filter(Boolean))],
    [concepts]
  );

  const allTags = useMemo(() =>
    [...new Set(concepts.flatMap((c) => c.tags))],
    [concepts]
  );

  const designers = useMemo(() =>
    [...new Set(concepts.map((c) => c.designer))],
    [concepts]
  );

  const filtered = useMemo(() => {
    let result = concepts.filter((c) => c.status !== 'archived');

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(s) ||
        c.description.toLowerCase().includes(s) ||
        c.tags.some((t) => t.toLowerCase().includes(s))
      );
    }
    if (statusFilter) result = result.filter((c) => c.status === statusFilter);
    if (collectionFilter) result = result.filter((c) => c.collection === collectionFilter);
    if (tagFilter) result = result.filter((c) => c.tags.includes(tagFilter));
    if (designerFilter) result = result.filter((c) => c.designer === designerFilter);
    if (lifecycleFilter) result = result.filter((c) => c.lifecycleType === lifecycleFilter);
    if (priorityFilter) result = result.filter((c) => c.priority === priorityFilter);

    result.sort((a, b) => {
      if (sortBy === 'updated') return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      if (sortBy === 'created') return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return a.name.localeCompare(b.name);
    });

    return result;
  }, [concepts, search, statusFilter, collectionFilter, tagFilter, designerFilter, lifecycleFilter, priorityFilter, sortBy]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Concepts Library</h2>
          <p className="text-sm text-muted">{filtered.length} concepts</p>
        </div>
        <button
          onClick={() => setShowNewModal(true)}
          className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
        >
          + New Concept
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search concepts..."
          className="bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent w-64"
        />
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          placeholder="All Statuses"
          options={[
            { value: 'ideation', label: 'Ideation' },
            { value: 'in_review', label: 'In Review' },
            { value: 'approved', label: 'Approved' },
            { value: 'ready_for_manufacturing', label: 'Ready for Mfg' },
            { value: 'manufactured', label: 'Manufactured' },
          ]}
        />
        <Select
          value={collectionFilter}
          onChange={setCollectionFilter}
          placeholder="All Collections"
          options={collections.map((c) => ({ value: c, label: c }))}
        />
        <Select
          value={tagFilter}
          onChange={setTagFilter}
          placeholder="All Tags"
          options={allTags.map((t) => ({ value: t, label: t }))}
        />
        <Select
          value={designerFilter}
          onChange={setDesignerFilter}
          placeholder="All Designers"
          options={designers.map((d) => ({ value: d, label: d }))}
        />
        <Select
          value={lifecycleFilter}
          onChange={setLifecycleFilter}
          placeholder="All Types"
          options={[
            { value: 'seasonal', label: 'Seasonal' },
            { value: 'evergreen', label: 'Evergreen' },
            { value: 'limited_edition', label: 'Limited Edition' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        <Select
          value={priorityFilter}
          onChange={setPriorityFilter}
          placeholder="All Priorities"
          options={[
            { value: 'urgent', label: 'Urgent' },
            { value: 'high', label: 'High' },
            { value: 'medium', label: 'Medium' },
            { value: 'low', label: 'Low' },
          ]}
        />
        <Select
          value={sortBy}
          onChange={(v) => setSortBy(v as typeof sortBy)}
          options={[
            { value: 'updated', label: 'Recently Updated' },
            { value: 'created', label: 'Recently Created' },
            { value: 'name', label: 'Name A-Z' },
          ]}
        />
        <div className="flex gap-1 ml-auto">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-2.5 py-2 rounded-lg text-sm ${viewMode === 'grid' ? 'bg-accent text-white' : 'bg-background border border-border text-muted'}`}
          >
            ▦
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-2.5 py-2 rounded-lg text-sm ${viewMode === 'list' ? 'bg-accent text-white' : 'bg-background border border-border text-muted'}`}
          >
            ☰
          </button>
        </div>
      </div>

      {/* Grid/List */}
      {filtered.length === 0 ? (
        <EmptyState
          icon="▦"
          title="No concepts found"
          description="Try adjusting your filters or create a new concept."
          action={{ label: '+ New Concept', onClick: () => setShowNewModal(true) }}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((c) => (
            <ConceptCard key={c.id} concept={c} onClick={() => onOpenConcept(c.id)} />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => onOpenConcept(c.id)}
              className="w-full bg-surface border border-border rounded-lg p-3 hover:border-border-light transition-all text-left flex items-center gap-4"
            >
              <div className="flex gap-1.5 shrink-0">
                <div className="w-10 h-10 rounded bg-background placeholder-pattern border border-border" />
                <div className="w-10 h-10 rounded bg-background placeholder-pattern border border-border" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{c.name}</div>
                <div className="text-xs text-muted">{c.collection} · {c.designer}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {c.tags.slice(0, 2).map((t) => (
                  <span key={t} className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded">{t}</span>
                ))}
              </div>
              <div className="shrink-0">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${
                  c.status === 'ideation' ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' :
                  c.status === 'in_review' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                  c.status === 'approved' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                  c.status === 'ready_for_manufacturing' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                  'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                }`}>
                  {c.status === 'ideation' ? 'Ideation' : c.status === 'in_review' ? 'In Review' : c.status === 'approved' ? 'Approved' : c.status === 'ready_for_manufacturing' ? 'Ready' : 'Made'}
                </span>
              </div>
              <span className="text-xs text-muted shrink-0">{new Date(c.updatedAt).toLocaleDateString()}</span>
            </button>
          ))}
        </div>
      )}

      {showNewModal && <NewConceptModal onClose={() => setShowNewModal(false)} onCreated={onOpenConcept} />}
    </div>
  );
}
