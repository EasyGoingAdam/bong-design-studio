'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import {
  Drop,
  listDrops,
  createDrop,
  updateDrop,
  deleteDrop,
  addConceptToDrop,
  removeConceptFromDrop,
  daysUntilLaunch,
} from '@/lib/drops';
import { HOLIDAY_EVENTS, nextOccurrence } from '@/lib/holiday-events';
import { useToast } from './toast';
import { ConfirmDialog } from './confirm-dialog';

/**
 * Drop Planner — group concepts into named seasonal launches with a
 * launch date and optional holiday pairing. Each drop shows a readiness
 * progress bar (% manufactured) and a countdown to launch.
 */
export function DropPlanner({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts } = useAppStore();
  const { toast } = useToast();

  const [drops, setDrops] = useState<Drop[]>([]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Drop | null>(null);
  const [pickingForDrop, setPickingForDrop] = useState<Drop | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Hydrate after mount (SSR-safe)
  useEffect(() => { setDrops(listDrops()); }, []);

  const refresh = () => setDrops(listDrops());

  const handleCreate = (input: Omit<Drop, 'id' | 'createdAt'>) => {
    createDrop(input);
    refresh();
    setCreating(false);
    toast(`Drop "${input.name}" created`, 'success');
  };

  const handleUpdate = (id: string, patch: Partial<Drop>) => {
    updateDrop(id, patch);
    refresh();
    setEditing(null);
    toast('Drop updated', 'success');
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteDrop(deleteId);
    refresh();
    setDeleteId(null);
    toast('Drop deleted', 'info');
  };

  const handleAddConcept = (drop: Drop, conceptId: string) => {
    addConceptToDrop(drop.id, conceptId);
    refresh();
    toast('Concept added to drop', 'success');
  };

  const handleRemoveConcept = (drop: Drop, conceptId: string) => {
    removeConceptFromDrop(drop.id, conceptId);
    refresh();
  };

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-5">
        <div>
          <div className="eyebrow mb-1">Seasonal Launches</div>
          <h2 className="display-sm">Drops</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Group concepts into named launches with a target date — pair with holidays from the Calendar.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium"
        >
          + New drop
        </button>
      </div>

      {drops.length === 0 ? (
        <div className="bg-surface border border-dashed border-border rounded-xl p-10 text-center">
          <div className="text-5xl mb-4 opacity-30">◇</div>
          <h3 className="serif text-xl font-medium mb-2">No drops yet</h3>
          <p className="text-sm text-muted max-w-md mx-auto mb-5">
            A drop is a named seasonal launch — like "Halloween 2026" or "Mother's Day Drop". Group concepts together,
            target a launch date, and watch readiness as you ship.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium"
          >
            + Create your first drop
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {drops.map((drop) => (
            <DropCard
              key={drop.id}
              drop={drop}
              concepts={concepts}
              onOpenConcept={onOpenConcept}
              onEdit={() => setEditing(drop)}
              onDelete={() => setDeleteId(drop.id)}
              onAddConcept={() => setPickingForDrop(drop)}
              onRemoveConcept={(cid) => handleRemoveConcept(drop, cid)}
            />
          ))}
        </div>
      )}

      {(creating || editing) && (
        <DropFormModal
          drop={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSubmit={(data) => {
            if (editing) handleUpdate(editing.id, data);
            else handleCreate(data);
          }}
        />
      )}

      {pickingForDrop && (
        <ConceptPickerModal
          drop={pickingForDrop}
          concepts={concepts}
          onPick={(id) => { handleAddConcept(pickingForDrop, id); setPickingForDrop(null); }}
          onClose={() => setPickingForDrop(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete this drop?"
        message="The concepts inside will not be deleted — just removed from this drop."
        confirmLabel="Delete drop"
        confirmVariant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

/* ───────────── Drop Card ───────────── */

function DropCard({
  drop, concepts, onOpenConcept, onEdit, onDelete, onAddConcept, onRemoveConcept,
}: {
  drop: Drop;
  concepts: import('@/lib/types').Concept[];
  onOpenConcept: (id: string) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddConcept: () => void;
  onRemoveConcept: (id: string) => void;
}) {
  const dropConcepts = useMemo(
    () => drop.conceptIds.map((id) => concepts.find((c) => c.id === id)).filter(Boolean) as typeof concepts,
    [drop.conceptIds, concepts]
  );
  const days = daysUntilLaunch(drop);
  const manufactured = dropConcepts.filter((c) => c.status === 'manufactured').length;
  const ready = dropConcepts.filter((c) => c.status === 'ready_for_manufacturing' || c.status === 'manufactured').length;
  const readyPct = dropConcepts.length === 0 ? 0 : (manufactured / dropConcepts.length) * 100;
  const launchDate = new Date(drop.launchDate + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
  const holiday = drop.holidayId ? HOLIDAY_EVENTS.find((h) => h.id === drop.holidayId) : null;
  const isImminent = days >= 0 && days <= 21;
  const isLate = days < 0;

  return (
    <div className={`bg-surface border rounded-xl overflow-hidden ${isImminent ? 'border-accent' : 'border-border'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              {holiday && <span className="text-xl">{holiday.emoji}</span>}
              <h3 className="serif text-2xl font-medium leading-tight">{drop.name}</h3>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
              <span>{launchDate}</span>
              <span>·</span>
              <span className={isImminent ? 'text-accent font-medium' : isLate ? 'text-red-700' : ''}>
                {isLate ? `${Math.abs(days)} days late` :
                 days === 0 ? 'launches today' :
                 days === 1 ? 'launches tomorrow' :
                 `${days} days to launch`}
              </span>
              {holiday && (
                <>
                  <span>·</span>
                  <span>paired with {holiday.name}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-1.5 shrink-0">
            <button onClick={onEdit} className="text-xs px-2.5 py-1 bg-background border border-border rounded hover:border-foreground">Edit</button>
            <button onClick={onDelete} className="text-xs px-2.5 py-1 text-red-700 hover:bg-red-50 border border-red-200 rounded">Delete</button>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-4">
          <div className="flex items-baseline justify-between text-xs mb-1.5">
            <span className="eyebrow">Readiness</span>
            <span className="text-muted tabular-nums">
              {manufactured}/{dropConcepts.length} manufactured · {ready}/{dropConcepts.length} ≥ ready
            </span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${readyPct}%` }}
            />
          </div>
        </div>

        {drop.notes && (
          <p className="text-xs text-muted mb-4 italic">{drop.notes}</p>
        )}

        {/* Concepts in this drop */}
        <div className="space-y-1.5">
          {dropConcepts.length === 0 ? (
            <div className="text-xs text-muted text-center py-4 italic">No concepts assigned yet.</div>
          ) : (
            dropConcepts.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-3 p-2 rounded-lg bg-background hover:bg-surface-hover border border-border group"
              >
                <button onClick={() => onOpenConcept(c.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-8 h-8 rounded bg-surface placeholder-pattern shrink-0 overflow-hidden">
                    {c.coilImageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.coilImageUrl} alt="" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted capitalize">{c.status.replace(/_/g, ' ')}</div>
                  </div>
                </button>
                <button
                  onClick={() => onRemoveConcept(c.id)}
                  className="text-muted hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity text-sm px-2"
                  title="Remove from drop"
                >
                  ×
                </button>
              </div>
            ))
          )}
        </div>

        <button
          onClick={onAddConcept}
          className="w-full mt-3 py-2 text-xs border border-dashed border-border rounded-lg text-muted hover:text-foreground hover:border-foreground"
        >
          + Add concept to drop
        </button>
      </div>
    </div>
  );
}

/* ───────────── New / Edit Drop Form ───────────── */

function DropFormModal({
  drop, onClose, onSubmit,
}: {
  drop: Drop | null;
  onClose: () => void;
  onSubmit: (data: Omit<Drop, 'id' | 'createdAt'>) => void;
}) {
  const isEdit = !!drop;
  const [name, setName] = useState(drop?.name || '');
  const [launchDate, setLaunchDate] = useState(drop?.launchDate || '');
  const [holidayId, setHolidayId] = useState(drop?.holidayId || '');
  const [notes, setNotes] = useState(drop?.notes || '');

  // When holiday is picked, auto-fill launch date if blank.
  const onPickHoliday = (id: string) => {
    setHolidayId(id);
    if (!launchDate && id) {
      const event = HOLIDAY_EVENTS.find((h) => h.id === id);
      if (event) {
        const d = nextOccurrence(event);
        if (d) {
          setLaunchDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
      }
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = () => {
    if (!name.trim() || !launchDate) return;
    onSubmit({
      name: name.trim(),
      launchDate,
      holidayId: holidayId || undefined,
      notes: notes.trim(),
      conceptIds: drop?.conceptIds || [],
    });
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="serif text-xl font-medium">{isEdit ? 'Edit drop' : 'New drop'}</h2>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="eyebrow block mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Halloween 2026"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
              autoFocus
            />
          </div>
          <div>
            <label className="eyebrow block mb-1">Pair with holiday <span className="font-normal italic">(optional)</span></label>
            <select
              value={holidayId}
              onChange={(e) => onPickHoliday(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
            >
              <option value="">— None —</option>
              {HOLIDAY_EVENTS.map((h) => (
                <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>
              ))}
            </select>
            <div className="text-[10px] text-muted mt-1">Picks auto-fill the launch date below.</div>
          </div>
          <div>
            <label className="eyebrow block mb-1">Launch date *</label>
            <input
              type="date"
              value={launchDate}
              onChange={(e) => setLaunchDate(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground"
            />
          </div>
          <div>
            <label className="eyebrow block mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Marketing angle, packaging plan, retailers…"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-foreground resize-none"
            />
          </div>
          <button
            onClick={submit}
            disabled={!name.trim() || !launchDate}
            className="w-full py-2 bg-accent hover:bg-accent-hover text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isEdit ? 'Save' : 'Create drop'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── Concept Picker ───────────── */

function ConceptPickerModal({
  drop, concepts, onPick, onClose,
}: {
  drop: Drop;
  concepts: import('@/lib/types').Concept[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return concepts
      .filter((c) => !drop.conceptIds.includes(c.id))
      .filter((c) =>
        !q || c.name.toLowerCase().includes(q) || c.tags.some((t) => t.toLowerCase().includes(q))
      )
      .slice(0, 50);
  }, [concepts, drop.conceptIds, search]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 bg-surface border-b border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="serif text-lg font-medium">Add to "{drop.name}"</h3>
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
            <div className="text-center text-sm text-muted py-8">No concepts match.</div>
          ) : (
            candidates.map((c) => (
              <button
                key={c.id}
                onClick={() => onPick(c.id)}
                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-surface-hover text-left"
              >
                <div className="w-8 h-8 rounded bg-background placeholder-pattern shrink-0 overflow-hidden">
                  {c.coilImageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.coilImageUrl} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[10px] text-muted capitalize">{c.status.replace(/_/g, ' ')}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
