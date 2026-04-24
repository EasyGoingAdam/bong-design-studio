'use client';

import { useState, useMemo } from 'react';
import { useAppStore } from '@/lib/store';
import { PriorityBadge, Tag } from './ui';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';
import { ImageDownloadButtons } from './image-download';
import { formatDate } from '@/lib/utils';

type SortBy = 'archived_desc' | 'archived_asc' | 'name_asc' | 'name_desc' | 'collection';
type ViewMode = 'list' | 'grid';

export function ArchiveBrowser({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts, updateConcept, deleteConcept } = useAppStore();
  const { toast } = useToast();

  const [search, setSearch] = useState('');
  const [collectionFilter, setCollectionFilter] = useState<string>('');
  const [designerFilter, setDesignerFilter] = useState<string>('');
  const [lifecycleFilter, setLifecycleFilter] = useState<string>('');
  const [priorityFilter, setPriorityFilter] = useState<string>('');
  const [sortBy, setSortBy] = useState<SortBy>('archived_desc');
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const allArchived = useMemo(
    () => concepts.filter((c) => c.status === 'archived'),
    [concepts]
  );

  // Derive filter options from the archived set
  const filterOptions = useMemo(() => {
    const collections = new Set<string>();
    const designers = new Set<string>();
    allArchived.forEach((c) => {
      if (c.collection) collections.add(c.collection);
      if (c.designer) designers.add(c.designer);
    });
    return {
      collections: Array.from(collections).sort(),
      designers: Array.from(designers).sort(),
    };
  }, [allArchived]);

  const filtered = useMemo(() => {
    let result = allArchived;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        c.collection.toLowerCase().includes(q) ||
        c.designer.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.tags.some((t) => t.toLowerCase().includes(q)) ||
        c.specs.designStyleName.toLowerCase().includes(q) ||
        c.specs.designTheme.toLowerCase().includes(q) ||
        c.intendedAudience.toLowerCase().includes(q) ||
        c.manufacturingNotes.toLowerCase().includes(q) ||
        (c.marketingStory || '').toLowerCase().includes(q) ||
        c.priority.toLowerCase().includes(q) ||
        c.lifecycleType.toLowerCase().includes(q)
      );
    }

    if (collectionFilter) result = result.filter((c) => c.collection === collectionFilter);
    if (designerFilter) result = result.filter((c) => c.designer === designerFilter);
    if (lifecycleFilter) result = result.filter((c) => c.lifecycleType === lifecycleFilter);
    if (priorityFilter) result = result.filter((c) => c.priority === priorityFilter);

    const sorted = [...result];
    switch (sortBy) {
      case 'archived_desc':
        sorted.sort((a, b) => new Date(b.archivedAt || b.updatedAt).getTime() - new Date(a.archivedAt || a.updatedAt).getTime());
        break;
      case 'archived_asc':
        sorted.sort((a, b) => new Date(a.archivedAt || a.updatedAt).getTime() - new Date(b.archivedAt || b.updatedAt).getTime());
        break;
      case 'name_asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'name_desc':
        sorted.sort((a, b) => b.name.localeCompare(a.name));
        break;
      case 'collection':
        sorted.sort((a, b) => (a.collection || '').localeCompare(b.collection || ''));
        break;
    }
    return sorted;
  }, [allArchived, search, collectionFilter, designerFilter, lifecycleFilter, priorityFilter, sortBy]);

  const clearFilters = () => {
    setSearch('');
    setCollectionFilter('');
    setDesignerFilter('');
    setLifecycleFilter('');
    setPriorityFilter('');
  };

  const hasActiveFilters =
    !!search || !!collectionFilter || !!designerFilter || !!lifecycleFilter || !!priorityFilter;

  const handleRestore = (id: string) => {
    updateConcept(id, { status: 'ideation' });
    toast('Concept restored to Ideation', 'success');
  };

  const handleDelete = (id: string) => {
    deleteConcept(id);
    setDeleteTarget(null);
    toast('Concept permanently deleted', 'success');
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllVisible = () => {
    const visibleIds = filtered.map((c) => c.id);
    const allSelected = visibleIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  const bulkRestore = () => {
    selected.forEach((id) => updateConcept(id, { status: 'ideation' }));
    toast(`${selected.size} concept${selected.size > 1 ? 's' : ''} restored to Ideation`, 'success');
    clearSelection();
  };

  const bulkDelete = () => {
    selected.forEach((id) => deleteConcept(id));
    toast(`${selected.size} concept${selected.size > 1 ? 's' : ''} permanently deleted`, 'success');
    clearSelection();
    setShowBulkDeleteConfirm(false);
  };

  const exportCSV = () => {
    const headers = ['Name', 'Collection', 'Designer', 'Description', 'Tags', 'Priority', 'Lifecycle', 'Created', 'Archived At'];
    const rows = filtered.map((c) => [
      c.name,
      c.collection,
      c.designer,
      c.description.replace(/\n/g, ' '),
      c.tags.join('; '),
      c.priority,
      c.lifecycleType,
      formatDate(c.createdAt),
      formatDate(c.archivedAt || c.updatedAt),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archive-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${filtered.length} concept${filtered.length !== 1 ? 's' : ''} to CSV`, 'success');
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Archive</h2>
          <p className="text-sm text-muted">
            {filtered.length}
            {hasActiveFilters && allArchived.length !== filtered.length && ` of ${allArchived.length}`}
            {' '}archived concept{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {filtered.length > 0 && (
            <button
              onClick={exportCSV}
              className="text-xs px-3 py-1.5 bg-background border border-border rounded-lg hover:bg-surface-hover transition-colors"
            >
              ↓ Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, collection, designer, tags, description, story, notes…"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent"
        />
      </div>

      {/* Filter / Sort / View row */}
      {allArchived.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {filterOptions.collections.length > 0 && (
            <select
              value={collectionFilter}
              onChange={(e) => setCollectionFilter(e.target.value)}
              className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
            >
              <option value="">All collections</option>
              {filterOptions.collections.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}
          {filterOptions.designers.length > 0 && (
            <select
              value={designerFilter}
              onChange={(e) => setDesignerFilter(e.target.value)}
              className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
            >
              <option value="">All designers</option>
              {filterOptions.designers.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          )}
          <select
            value={lifecycleFilter}
            onChange={(e) => setLifecycleFilter(e.target.value)}
            className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
          >
            <option value="">All lifecycles</option>
            <option value="evergreen">Evergreen</option>
            <option value="seasonal">Seasonal</option>
            <option value="limited_edition">Limited Edition</option>
            <option value="custom">Custom</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
          >
            <option value="">All priorities</option>
            <option value="urgent">Urgent</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          <span className="text-border">|</span>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="text-xs bg-background border border-border rounded-lg px-2 py-1.5"
          >
            <option value="archived_desc">Recently archived</option>
            <option value="archived_asc">Oldest archived</option>
            <option value="name_asc">Name A–Z</option>
            <option value="name_desc">Name Z–A</option>
            <option value="collection">Collection</option>
          </select>

          <div className="flex bg-background border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('list')}
              className={`px-2 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
              title="List view"
            >
              ☰
            </button>
            <button
              onClick={() => setViewMode('grid')}
              className={`px-2 py-1.5 text-xs transition-colors ${viewMode === 'grid' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}
              title="Grid view"
            >
              ▦
            </button>
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="text-xs text-muted hover:text-foreground px-2 py-1.5"
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-accent">{selected.size} selected</span>
          <div className="h-4 w-px bg-border" />
          <button
            onClick={bulkRestore}
            className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
          >
            Restore All
          </button>
          <button
            onClick={() => setShowBulkDeleteConfirm(true)}
            className="text-xs px-3 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
          >
            Delete All
          </button>
          <button
            onClick={clearSelection}
            className="text-xs text-muted hover:text-foreground ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      {/* Select-all toggle (only shown with results) */}
      {filtered.length > 0 && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={filtered.every((c) => selected.has(c.id))}
            onChange={selectAllVisible}
            className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
          />
          <span className="text-muted">Select all visible</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl mb-3 opacity-40">📦</div>
          <h3 className="text-lg font-medium mb-1">
            {hasActiveFilters ? 'No matches found' : 'No archived concepts'}
          </h3>
          <p className="text-sm text-muted max-w-md mx-auto">
            {hasActiveFilters
              ? 'Try adjusting your search or filters.'
              : 'Archived concepts will appear here. You can restore them back to the pipeline or permanently delete them.'}
          </p>
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`bg-surface border rounded-xl p-4 hover:border-border-light transition-all ${selected.has(c.id) ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}
            >
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <div className="pt-1 shrink-0">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                  />
                </div>

                {/* Images */}
                <div className="flex gap-2 shrink-0">
                  <div className="w-20 h-20 rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden relative group">
                    {c.coilImageUrl ? (
                      <>
                        <img src={c.coilImageUrl} alt="Coil" className="w-full h-full object-contain" />
                        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ImageDownloadButtons imageUrl={c.coilImageUrl} filename={`${c.name}-coil`} />
                        </div>
                      </>
                    ) : (
                      <span className="text-[8px] text-muted">Coil</span>
                    )}
                  </div>
                  <div className="w-20 h-20 rounded-lg bg-background placeholder-pattern border border-border flex items-center justify-center overflow-hidden relative group">
                    {c.baseImageUrl ? (
                      <>
                        <img src={c.baseImageUrl} alt="Base" className="w-full h-full object-contain" />
                        <div className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <ImageDownloadButtons imageUrl={c.baseImageUrl} filename={`${c.name}-base`} />
                        </div>
                      </>
                    ) : (
                      <span className="text-[8px] text-muted">Base</span>
                    )}
                  </div>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <button onClick={() => onOpenConcept(c.id)} className="text-left hover:text-accent transition-colors">
                    <h3 className="text-sm font-semibold truncate">{c.name}</h3>
                  </button>
                  <p className="text-xs text-muted mt-0.5">{c.collection || 'No collection'} · {c.designer}</p>
                  {c.description && (
                    <p className="text-xs text-muted mt-1 line-clamp-2">{c.description}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-1.5 mt-2">
                    <PriorityBadge priority={c.priority} />
                    {c.tags.slice(0, 4).map((t) => <Tag key={t} label={t} />)}
                    {c.tags.length > 4 && <span className="text-xs text-muted">+{c.tags.length - 4}</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-2 text-xs text-muted flex-wrap">
                    <span title={new Date(c.archivedAt || c.updatedAt).toLocaleString()}>
                      📦 Archived {formatDate(c.archivedAt || c.updatedAt)}
                    </span>
                    <span title={new Date(c.createdAt).toLocaleString()}>
                      Created {formatDate(c.createdAt)}
                    </span>
                    <span>{c.versions.length} version{c.versions.length !== 1 ? 's' : ''}</span>
                    <span>{c.comments.length} comment{c.comments.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 shrink-0">
                  <button
                    onClick={() => handleRestore(c.id)}
                    className="px-3 py-1.5 text-xs bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => onOpenConcept(c.id)}
                    className="px-3 py-1.5 text-xs bg-background border border-border rounded-lg hover:bg-surface-hover transition-colors"
                  >
                    View
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c.id)}
                    className="px-3 py-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // GRID VIEW
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((c) => (
            <div
              key={c.id}
              className={`bg-surface border rounded-xl overflow-hidden hover:border-border-light transition-all ${selected.has(c.id) ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}
            >
              <div className="relative aspect-square bg-background placeholder-pattern flex items-center justify-center">
                <div className="absolute top-2 left-2 z-10">
                  <input
                    type="checkbox"
                    checked={selected.has(c.id)}
                    onChange={() => toggleSelect(c.id)}
                    className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                  />
                </div>
                {c.coilImageUrl ? (
                  <img
                    src={c.coilImageUrl}
                    alt={c.name}
                    className="w-full h-full object-contain cursor-pointer"
                    onClick={() => onOpenConcept(c.id)}
                  />
                ) : c.baseImageUrl ? (
                  <img
                    src={c.baseImageUrl}
                    alt={c.name}
                    className="w-full h-full object-contain cursor-pointer"
                    onClick={() => onOpenConcept(c.id)}
                  />
                ) : (
                  <span className="text-xs text-muted">No image</span>
                )}
              </div>
              <div className="p-3">
                <button
                  onClick={() => onOpenConcept(c.id)}
                  className="text-left hover:text-accent transition-colors w-full"
                >
                  <h3 className="text-sm font-semibold truncate">{c.name}</h3>
                </button>
                <p className="text-[10px] text-muted truncate mt-0.5">{c.collection || 'No collection'}</p>
                <p className="text-[10px] text-muted mt-0.5">Archived {formatDate(c.archivedAt || c.updatedAt)}</p>
                <div className="flex gap-1 mt-2">
                  <button
                    onClick={() => handleRestore(c.id)}
                    className="flex-1 px-2 py-1 text-[10px] bg-accent hover:bg-accent-hover text-white rounded transition-colors"
                  >
                    Restore
                  </button>
                  <button
                    onClick={() => setDeleteTarget(c.id)}
                    className="px-2 py-1 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 transition-colors"
                    title="Delete permanently"
                  >
                    ×
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Concept Permanently"
        message="This will permanently delete this concept and all its versions, images, comments, and AI generations. This cannot be undone."
        confirmLabel="Delete Permanently"
        confirmVariant="danger"
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Delete ${selected.size} Concept${selected.size !== 1 ? 's' : ''} Permanently`}
        message="All selected concepts and their versions, images, comments, and AI generations will be permanently deleted. This cannot be undone."
        confirmLabel="Delete All"
        confirmVariant="danger"
        onConfirm={bulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
