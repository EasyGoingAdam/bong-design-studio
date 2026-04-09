'use client';

import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppStore } from '@/lib/store';
import { KANBAN_COLUMNS, STATUS_LABELS, ConceptStatus } from '@/lib/types';
import { ConceptCardMini } from './concept-card';
import { useToast } from './toast';

const COLUMN_COLORS: Record<ConceptStatus, string> = {
  ideation: 'border-t-purple-400',
  in_review: 'border-t-amber-400',
  approved: 'border-t-green-400',
  ready_for_manufacturing: 'border-t-blue-400',
  manufactured: 'border-t-emerald-400',
  archived: 'border-t-gray-300',
};

export function WorkflowBoard({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts, moveConcept } = useAppStore();
  const { toast } = useToast();
  const [mfgSearch, setMfgSearch] = useState('');

  const columns = useMemo(() => {
    const map: Record<string, typeof concepts> = {};
    for (const col of KANBAN_COLUMNS) {
      let items = concepts.filter((c) => c.status === col);

      // Apply search filter to manufactured column
      if (col === 'manufactured' && mfgSearch.trim()) {
        const q = mfgSearch.toLowerCase();
        items = items.filter((c) =>
          c.name.toLowerCase().includes(q) ||
          c.collection.toLowerCase().includes(q) ||
          c.designer.toLowerCase().includes(q) ||
          c.description.toLowerCase().includes(q) ||
          c.tags.some((t) => t.toLowerCase().includes(q)) ||
          c.specs.designStyleName.toLowerCase().includes(q) ||
          c.specs.designTheme.toLowerCase().includes(q) ||
          c.intendedAudience.toLowerCase().includes(q) ||
          c.manufacturingNotes.toLowerCase().includes(q) ||
          c.manufacturingRecord?.batchName?.toLowerCase().includes(q) ||
          c.manufacturingRecord?.targetMaterial?.toLowerCase().includes(q) ||
          c.priority.toLowerCase().includes(q) ||
          c.lifecycleType.toLowerCase().includes(q)
        );
      }

      map[col] = items;
    }
    return map;
  }, [concepts, mfgSearch]);

  // Count without filter for the badge
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

  return (
    <div className="p-6 h-full">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">Workflow Board</h2>
        <p className="text-sm text-muted">Drag concepts between stages</p>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 200px)' }}>
          {KANBAN_COLUMNS.map((col) => (
            <div key={col} className={`flex-shrink-0 w-72 bg-surface border border-border rounded-xl border-t-2 ${COLUMN_COLORS[col]} flex flex-col`}>
              {/* Column Header */}
              <div className="p-3 border-b border-border">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{STATUS_LABELS[col]}</h3>
                  <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded-full">
                    {col === 'manufactured' && mfgSearch ? `${columns[col]?.length}/${mfgTotalCount}` : columns[col]?.length || 0}
                  </span>
                </div>

                {/* Search bar for Manufactured column */}
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
                    {columns[col]?.map((concept, index) => (
                      <Draggable key={concept.id} draggableId={concept.id} index={index}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.draggableProps}
                            {...provided.dragHandleProps}
                            className={`${snapshot.isDragging ? 'opacity-80 rotate-1' : ''}`}
                          >
                            <ConceptCardMini
                              concept={concept}
                              onClick={() => onOpenConcept(concept.id)}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    {(columns[col]?.length || 0) === 0 && !snapshot.isDraggingOver && (
                      <div className="text-center text-xs text-muted py-8 opacity-50">
                        {col === 'manufactured' && mfgSearch ? 'No matches found' : 'Drop concepts here'}
                      </div>
                    )}
                  </div>
                )}
              </Droppable>
            </div>
          ))}
        </div>
      </DragDropContext>
    </div>
  );
}
