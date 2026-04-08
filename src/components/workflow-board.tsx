'use client';

import { useMemo } from 'react';
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

  const columns = useMemo(() => {
    const map: Record<string, typeof concepts> = {};
    for (const col of KANBAN_COLUMNS) {
      map[col] = concepts.filter((c) => c.status === col);
    }
    return map;
  }, [concepts]);

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
              <div className="p-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold">{STATUS_LABELS[col]}</h3>
                <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded-full">
                  {columns[col]?.length || 0}
                </span>
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
                        Drop concepts here
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
