'use client';

import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppStore } from '@/lib/store';
import { KANBAN_COLUMNS, STATUS_LABELS, ConceptStatus, Concept } from '@/lib/types';
import { ConceptCardMini } from './concept-card';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';

const COLUMN_COLORS: Record<ConceptStatus, string> = {
  ideation: 'border-t-purple-400',
  in_review: 'border-t-amber-400',
  approved: 'border-t-green-400',
  ready_for_manufacturing: 'border-t-blue-400',
  manufactured: 'border-t-emerald-400',
  archived: 'border-t-gray-300',
};

// Rich text search used by the per-column filters
function matchesSearch(concept: Concept, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    concept.name.toLowerCase().includes(lower) ||
    concept.collection.toLowerCase().includes(lower) ||
    concept.designer.toLowerCase().includes(lower) ||
    concept.description.toLowerCase().includes(lower) ||
    concept.tags.some((t) => t.toLowerCase().includes(lower)) ||
    concept.specs.designStyleName.toLowerCase().includes(lower) ||
    concept.specs.designTheme.toLowerCase().includes(lower) ||
    concept.intendedAudience.toLowerCase().includes(lower) ||
    concept.manufacturingNotes.toLowerCase().includes(lower) ||
    (concept.marketingStory || '').toLowerCase().includes(lower) ||
    concept.priority.toLowerCase().includes(lower) ||
    concept.lifecycleType.toLowerCase().includes(lower)
  );
}

export function WorkflowBoard({
  onOpenConcept,
  onOpenArchive,
}: {
  onOpenConcept: (id: string) => void;
  onOpenArchive?: () => void;
}) {
  const { concepts, moveConcept, deleteConcept, updateConcept } = useAppStore();
  const { toast } = useToast();

  // Global search across every column
  const [globalSearch, setGlobalSearch] = useState('');
  // Per-column search (only for Manufactured and Archived since those grow unbounded)
  const [mfgSearch, setMfgSearch] = useState('');
  const [archiveSearch, setArchiveSearch] = useState('');

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const columns = useMemo(() => {
    const map: Record<string, Concept[]> = {};
    const g = globalSearch.trim();
    for (const col of KANBAN_COLUMNS) {
      let items = concepts.filter((c) => c.status === col);
      if (g) {
        items = items.filter((c) => matchesSearch(c, g));
      }
      if (col === 'manufactured' && mfgSearch.trim()) {
        items = items.filter((c) => matchesSearch(c, mfgSearch.trim()));
      }
      if (col === 'archived' && archiveSearch.trim()) {
        items = items.filter((c) => matchesSearch(c, archiveSearch.trim()));
      }
      map[col] = items;
    }
    return map;
  }, [concepts, globalSearch, mfgSearch, archiveSearch]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllInColumn = (col: ConceptStatus) => {
    const ids = (columns[col] || []).map((c) => c.id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      if (allSelected) {
        ids.forEach((id) => next.delete(id));
      } else {
        ids.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const bulkMove = (status: ConceptStatus) => {
    selectedIds.forEach((id) => moveConcept(id, status));
    toast(`Moved ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''} to ${STATUS_LABELS[status]}`, 'success');
    clearSelection();
  };

  const bulkArchive = () => {
    selectedIds.forEach((id) => updateConcept(id, { status: 'archived' }));
    toast(`Archived ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''}`, 'info');
    clearSelection();
  };

  const bulkDelete = () => {
    selectedIds.forEach((id) => deleteConcept(id));
    toast(`Deleted ${selectedIds.size} concept${selectedIds.size > 1 ? 's' : ''}`, 'success');
    clearSelection();
    setShowBulkDeleteConfirm(false);
  };

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const conceptId = result.draggableId;
    const newStatus = result.destination.droppableId as ConceptStatus;
    moveConcept(conceptId, newStatus);
    toast(`Moved to ${STATUS_LABELS[newStatus]}`, 'success');
  };

  const hasSelection = selectedIds.size > 0;

  // Unfiltered totals (so badge can show "2/12" when filtering)
  const totalByStatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of KANBAN_COLUMNS) {
      map[col] = concepts.filter((c) => c.status === col).length;
    }
    return map;
  }, [concepts]);

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-4 gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">Workflow Board</h2>
          <p className="text-sm text-muted">
            Drag concepts between stages{hasSelection ? '' : ' — click checkboxes to multi-select'}
          </p>
        </div>
        <div className="relative w-full max-w-sm">
          <input
            type="text"
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder="Search all columns — name, tag, designer, theme…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-8 py-2 text-sm focus:outline-none focus:border-accent"
            aria-label="Global search across workflow board"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
          {globalSearch && (
            <button
              onClick={() => setGlobalSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-foreground text-sm leading-none px-1"
              aria-label="Clear search"
            >
              ×
            </button>
          )}
        </div>
      </div>

      {/* Bulk Action Toolbar */}
      {hasSelection && (
        <div className="bg-accent/5 border border-accent/20 rounded-lg p-3 mb-4 flex items-center gap-3 flex-wrap">
          <span className="text-sm font-medium text-accent">{selectedIds.size} selected</span>
          <div className="h-4 w-px bg-border" />
          <div className="flex gap-2 flex-wrap">
            {KANBAN_COLUMNS.map((col) => (
              <button
                key={col}
                onClick={() => bulkMove(col)}
                className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover transition-colors"
              >
                Move to {STATUS_LABELS[col]}
              </button>
            ))}
            <button
              onClick={bulkArchive}
              className="text-xs px-2.5 py-1.5 bg-surface border border-border rounded-lg hover:bg-surface-hover text-muted transition-colors"
            >
              Archive All
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="text-xs px-2.5 py-1.5 bg-red-50 border border-red-200 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
            >
              Delete All
            </button>
          </div>
          <button
            onClick={clearSelection}
            className="text-xs text-muted hover:text-foreground ml-auto"
          >
            Clear selection
          </button>
        </div>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 260px)' }}>
          {KANBAN_COLUMNS.map((col) => {
            const colConcepts = columns[col] || [];
            const allSelected = colConcepts.length > 0 && colConcepts.every((c) => selectedIds.has(c.id));
            const isSearchable = col === 'manufactured' || col === 'archived';
            const searchValue = col === 'manufactured' ? mfgSearch : col === 'archived' ? archiveSearch : '';
            const setSearchValue = col === 'manufactured' ? setMfgSearch : col === 'archived' ? setArchiveSearch : undefined;
            const hasActiveSearch = !!searchValue || !!globalSearch.trim();
            const total = totalByStatus[col] || 0;

            return (
              <div
                key={col}
                className={`flex-shrink-0 w-72 bg-surface border border-border rounded-xl border-t-2 ${COLUMN_COLORS[col]} flex flex-col`}
              >
                {/* Column Header */}
                <div className="p-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => selectAllInColumn(col)}
                        className="w-3.5 h-3.5 rounded accent-accent cursor-pointer shrink-0"
                        title={`Select all in ${STATUS_LABELS[col]}`}
                      />
                      <h3 className="text-sm font-semibold truncate">{STATUS_LABELS[col]}</h3>
                    </div>
                    <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded-full shrink-0">
                      {hasActiveSearch ? `${colConcepts.length}/${total}` : colConcepts.length}
                    </span>
                  </div>

                  {isSearchable && setSearchValue && (
                    <input
                      type="text"
                      value={searchValue}
                      onChange={(e) => setSearchValue(e.target.value)}
                      placeholder={`Search ${STATUS_LABELS[col].toLowerCase()}…`}
                      className="w-full mt-2 bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                    />
                  )}

                  {col === 'archived' && onOpenArchive && total > 0 && (
                    <button
                      onClick={onOpenArchive}
                      className="mt-2 w-full text-[10px] text-muted hover:text-accent transition-colors"
                      title="Open full archive page with advanced filters + CSV export"
                    >
                      Open full archive page →
                    </button>
                  )}
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`flex-1 p-2 space-y-2 overflow-y-auto transition-colors ${
                        snapshot.isDraggingOver ? 'bg-accent/5' : ''
                      }`}
                    >
                      {colConcepts.map((concept, index) => (
                        <Draggable key={concept.id} draggableId={concept.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              className={`${snapshot.isDragging ? 'opacity-80 rotate-1' : ''} relative`}
                            >
                              {/* Selection checkbox overlay */}
                              <div className="absolute top-2 left-2 z-10">
                                <input
                                  type="checkbox"
                                  checked={selectedIds.has(concept.id)}
                                  onChange={(e) => { e.stopPropagation(); toggleSelect(concept.id); }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                                />
                              </div>
                              <div className={`${selectedIds.has(concept.id) ? 'ring-2 ring-accent ring-offset-1 rounded-lg' : ''} ${col === 'archived' ? 'opacity-75' : ''}`}>
                                <ConceptCardMini
                                  concept={concept}
                                  onClick={() => onOpenConcept(concept.id)}
                                />
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                      {colConcepts.length === 0 && !snapshot.isDraggingOver && (
                        <div className="text-center text-xs text-muted py-8 opacity-50">
                          {hasActiveSearch
                            ? 'No matches found'
                            : col === 'archived'
                              ? 'Nothing archived'
                              : 'Drop concepts here'}
                        </div>
                      )}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      <ConfirmDialog
        open={showBulkDeleteConfirm}
        title={`Delete ${selectedIds.size} Concept${selectedIds.size > 1 ? 's' : ''}`}
        message="This will permanently delete all selected concepts and their versions, images, comments, and AI generations. This cannot be undone."
        confirmLabel="Delete All"
        confirmVariant="danger"
        onConfirm={bulkDelete}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />
    </div>
  );
}
