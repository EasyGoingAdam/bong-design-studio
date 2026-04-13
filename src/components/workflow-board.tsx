'use client';

import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppStore } from '@/lib/store';
import { KANBAN_COLUMNS, STATUS_LABELS, ConceptStatus } from '@/lib/types';
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

export function WorkflowBoard({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts, moveConcept, deleteConcept, updateConcept } = useAppStore();
  const { toast } = useToast();
  const [mfgSearch, setMfgSearch] = useState('');

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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

  const columns = useMemo(() => {
    const map: Record<string, typeof concepts> = {};
    for (const col of KANBAN_COLUMNS) {
      let items = concepts.filter((c) => c.status === col);
      if (col === 'manufactured' && mfgSearch.trim()) {
        const q = mfgSearch.toLowerCase();
        items = items.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          c.collection.toLowerCase().includes(q) ||
          c.designer.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q))
        );
      }
      map[col] = items;
    }
    return map;
  }, [concepts, mfgSearch]);

  const mfgTotalCount = useMemo(
    () => concepts.filter((c) => c.status === 'manufactured').length,
    [concepts]
  );

  const handleDragEnd = (result: DropResult) => {
    if (!result.destination) return;
    const conceptId = result.draggableId;
    const newStatus = result.destination.droppableId as ConceptStatus;
    moveConcept(conceptId, newStatus);
    toast(`Moved to ${STATUS_LABELS[newStatus]}`, 'success');
  };

  const hasSelection = selectedIds.size > 0;

  return (
    <div className="p-6 h-full">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold">Workflow Board</h2>
          <p className="text-sm text-muted">Drag concepts between stages{hasSelection ? '' : ' — click checkboxes to multi-select'}</p>
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

            return (
              <div key={col} className={`flex-shrink-0 w-72 bg-surface border border-border rounded-xl border-t-2 ${COLUMN_COLORS[col]} flex flex-col`}>
                {/* Column Header */}
                <div className="p-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        onChange={() => selectAllInColumn(col)}
                        className="w-3.5 h-3.5 rounded accent-accent cursor-pointer"
                        title={`Select all in ${STATUS_LABELS[col]}`}
                      />
                      <h3 className="text-sm font-semibold">{STATUS_LABELS[col]}</h3>
                    </div>
                    <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded-full">
                      {col === 'manufactured' && mfgSearch ? `${colConcepts.length}/${mfgTotalCount}` : colConcepts.length}
                    </span>
                  </div>

                  {col === 'manufactured' && (
                    <input
                      type="text"
                      value={mfgSearch}
                      onChange={(e) => setMfgSearch(e.target.value)}
                      placeholder="Search manufactured..."
                      className="w-full mt-2 bg-background border border-border rounded-md px-2 py-1.5 text-xs focus:outline-none focus:border-accent"
                    />
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
                              <div className={`${selectedIds.has(concept.id) ? 'ring-2 ring-accent ring-offset-1 rounded-lg' : ''}`}>
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
                          {col === 'manufactured' && mfgSearch ? 'No matches found' : 'Drop concepts here'}
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
