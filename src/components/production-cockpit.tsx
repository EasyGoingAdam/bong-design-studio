'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { BotChat } from './bot-chat';
import { todayKey, fmtMinutes } from '@/lib/production';
import { ProductionJob, PriorityLevel, Concept, Machine } from '@/lib/types';

const PRIORITY_DOT: Record<PriorityLevel, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

const CONCEPT_PREFIX = 'concept::';
const minutesSince = (iso?: string) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : 0);

/**
 * Production Cockpit — a flexible, drag-and-drop shop-floor board. Multiple
 * laser etchers can run in parallel: each active machine is its own lane with
 * its own running job. Work is pulled from a "Ready" pool of approved designs
 * and a backlog, and dragged freely between lanes, reordered, or dropped onto
 * the Done / Problem zones. Every action maps 1:1 to /api/bot/production so the
 * bot and the techs drive the same jobs.
 */
export function ProductionCockpit() {
  const productionJobs = useAppStore((s) => s.productionJobs);
  const concepts = useAppStore((s) => s.concepts);
  const machines = useAppStore((s) => s.machines);
  const scheduleDays = useAppStore((s) => s.scheduleDays);
  const settings = useAppStore((s) => s.productionSettings);
  const currentUser = useAppStore((s) => s.currentUser);
  const updateProductionJob = useAppStore((s) => s.updateProductionJob);
  const addProductionJob = useAppStore((s) => s.addProductionJob);
  const closeOutDay = useAppStore((s) => s.closeOutDay);
  const { toast } = useToast();

  const today = todayKey();
  const [pickSearch, setPickSearch] = useState('');
  const [completing, setCompleting] = useState<ProductionJob | null>(null);
  const [qtyMade, setQtyMade] = useState(0);
  const [qtyFailed, setQtyFailed] = useState(0);
  const [qcResult, setQcResult] = useState<'pass' | 'fail'>('pass');
  const [qcNotes, setQcNotes] = useState('');
  const [showChat, setShowChat] = useState(false);
  const [closing, setClosing] = useState(false);

  // Lanes = active machines (fallback to a single unassigned lane).
  const lanes: Machine[] = useMemo(() => {
    const active = machines.filter((m) => m.active).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return active.length ? active : [{ id: '', name: 'Unassigned', active: true, dailyPieceTarget: settings.dailyPieceTarget, dailyHours: 8, notes: '', position: 0 }];
  }, [machines, settings]);

  const { jobsByMachine, backlog, completedToday, problems, targetPieces, madePieces } = useMemo(() => {
    const onToday = (j: ProductionJob) => j.scheduledDate === today;
    const workable = (j: ProductionJob) => j.status === 'scheduled' || j.status === 'in_progress' || j.status === 'paused';

    const jobsByMachine: Record<string, ProductionJob[]> = {};
    for (const m of lanes) jobsByMachine[m.id] = [];
    for (const j of productionJobs) {
      if (!workable(j) || !onToday(j)) continue;
      const key = j.machineId && jobsByMachine[j.machineId] ? j.machineId : lanes[0].id;
      jobsByMachine[key].push(j);
    }
    for (const k of Object.keys(jobsByMachine)) {
      jobsByMachine[k].sort((a, b) => {
        // Running first, then by scheduled position.
        if ((a.status === 'in_progress') !== (b.status === 'in_progress')) return a.status === 'in_progress' ? -1 : 1;
        return (a.scheduledPosition ?? 0) - (b.scheduledPosition ?? 0);
      });
    }

    // Backlog = unscheduled / unassigned work waiting to be placed on a machine.
    const backlog = productionJobs
      .filter((j) => j.status === 'backlog' || (j.status === 'scheduled' && !j.machineId && !onToday(j)))
      .sort((a, b) => (a.scheduledPosition ?? 0) - (b.scheduledPosition ?? 0));

    const completedToday = productionJobs.filter((j) => j.status === 'completed' && onToday(j));
    const problems = productionJobs.filter((j) => j.status === 'held' || j.status === 'rework');

    const activeMachines = machines.filter((m) => m.active);
    const targetPieces =
      activeMachines.reduce((s, m) => s + (m.dailyPieceTarget || settings.dailyPieceTarget || 0), 0) || settings.dailyPieceTarget || 0;
    const madePieces = completedToday.reduce((s, j) => s + (j.quantityCompleted || j.quantity || 0), 0);
    return { jobsByMachine, backlog, completedToday, problems, targetPieces, madePieces };
  }, [productionJobs, machines, lanes, settings, today]);

  const readyConcepts = useMemo(() => {
    const openConceptIds = new Set(
      productionJobs.filter((j) => j.status !== 'completed' && j.conceptId).map((j) => j.conceptId as string),
    );
    const term = pickSearch.trim().toLowerCase();
    const rank: Record<PriorityLevel, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
    return concepts
      .filter((c) => c.status === 'approved' || c.status === 'ready_for_manufacturing')
      .filter((c) => !openConceptIds.has(c.id))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.tags || []).some((t) => t.toLowerCase().includes(term)))
      .sort((a, b) => {
        if (!!b.highlighted !== !!a.highlighted) return b.highlighted ? 1 : -1;
        return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0) || (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  }, [concepts, productionJobs, pickSearch]);

  const todayRow = scheduleDays.find((d) => d.date === today);
  const dayClosed = !!todayRow?.closed;

  // ── Job actions ─────────────────────────────────────────────────────────
  const start = (j: ProductionJob) =>
    updateProductionJob(j.id, { status: 'in_progress', actualStartTime: new Date().toISOString(), scheduledDate: j.scheduledDate || today });
  const pause = (j: ProductionJob) =>
    updateProductionJob(j.id, {
      status: 'paused',
      accumulatedMinutes: (j.accumulatedMinutes || 0) + (j.status === 'in_progress' ? minutesSince(j.actualStartTime) : 0),
      pauseCount: (j.pauseCount || 0) + 1,
    });
  const openComplete = (j: ProductionJob) => {
    setCompleting(j); setQtyMade(j.quantityCompleted || j.quantity || 1); setQtyFailed(0); setQcResult('pass'); setQcNotes('');
  };
  const submitComplete = async () => {
    if (!completing) return;
    const j = completing;
    const extra = j.status === 'in_progress' ? minutesSince(j.actualStartTime) : 0;
    await updateProductionJob(j.id, {
      status: 'completed', actualEndTime: new Date().toISOString(),
      actualTotalMinutes: (j.accumulatedMinutes || 0) + extra,
      quantityCompleted: qtyMade, quantityFailed: qtyFailed, qcResult, qcNotes, scheduledDate: j.scheduledDate || today,
    });
    setCompleting(null);
    toast(qcResult === 'pass' ? 'Job completed ✓' : 'Completed — QC flagged', qcResult === 'pass' ? 'success' : 'info');
  };
  const flagProblem = (j: ProductionJob, kind: 'held' | 'rework') => {
    const reason = window.prompt(kind === 'rework' ? 'Rework reason?' : 'What went wrong? (visible to team + bot)', '');
    if (reason === null) return;
    if (kind === 'rework') updateProductionJob(j.id, { status: 'rework', reworkReason: reason || 'Unspecified' });
    else updateProductionJob(j.id, { status: 'held', notes: `${j.notes ? j.notes + '\n' : ''}[HELD ${today}] ${reason || 'Unspecified'}` });
    toast(kind === 'rework' ? 'Marked for rework' : 'Flagged as a problem', 'info');
  };
  const resolveProblem = (j: ProductionJob) => updateProductionJob(j.id, { status: 'scheduled', scheduledDate: today, machineId: j.machineId || lanes[0].id });

  const createJobFromConcept = async (conceptId: string, extra: Partial<ProductionJob>) => {
    const c = concepts.find((x) => x.id === conceptId);
    if (!c) return;
    const lc = c.specs?.laserComplexity || 3;
    const complexity = lc <= 1 ? 'low' : lc <= 3 ? 'medium' : lc === 4 ? 'high' : 'very_high';
    const created = await addProductionJob({
      title: c.name, sourceType: 'workflow', conceptId: c.id, designName: c.name,
      designImageUrl: c.coilImageUrl || c.combinedImageUrl || c.baseImageUrl || '',
      productType: c.collection || '', complexity: complexity as ProductionJob['complexity'], priority: c.priority,
      tags: Array.from(new Set([...(c.tags || []), 'One of Ones'])),
      designNotes: c.manufacturingNotes || c.description || '', quantity: 1,
      ...extra,
    });
    if (created) toast(`Added “${created.title}”`, 'success');
    else toast('Could not create the job', 'error');
  };

  // ── Drag handling ─────────────────────────────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;
    const dest = destination.droppableId;

    // Dragging an approved design out of the Ready pool → create a job.
    if (draggableId.startsWith(CONCEPT_PREFIX)) {
      const conceptId = draggableId.slice(CONCEPT_PREFIX.length);
      if (dest === 'ready') return;
      if (dest === 'backlog') return createJobFromConcept(conceptId, { status: 'backlog', scheduledPosition: destination.index });
      if (dest === 'problem' || dest === 'done') return; // not meaningful for a fresh design
      // machine lane
      return createJobFromConcept(conceptId, { status: 'scheduled', machineId: dest, scheduledDate: today, scheduledPosition: destination.index });
    }

    // Dragging an existing job.
    const job = productionJobs.find((j) => j.id === draggableId);
    if (!job) return;
    const patch: Partial<ProductionJob> = { scheduledPosition: destination.index };
    if (dest === 'ready') return; // can't turn a job back into a design
    if (dest === 'backlog') { patch.status = 'backlog'; patch.machineId = ''; patch.scheduledDate = ''; }
    else if (dest === 'problem') { patch.status = 'held'; patch.scheduledDate = today; }
    else if (dest === 'done') {
      patch.status = 'completed'; patch.scheduledDate = today;
      if (!job.quantityCompleted) patch.quantityCompleted = job.quantity;
    } else {
      // machine lane
      patch.machineId = dest; patch.scheduledDate = today;
      if (job.status === 'backlog' || job.status === 'held' || job.status === 'rework') patch.status = 'scheduled';
    }
    await updateProductionJob(draggableId, patch);
  };

  const pct = targetPieces > 0 ? Math.min(100, Math.round((madePieces / targetPieces) * 100)) : 0;
  const firstName = (currentUser?.name || '').split(' ')[0] || 'there';
  const jobsLeft = lanes.reduce((s, m) => s + jobsByMachine[m.id].length, 0) + backlog.length;

  return (
    <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <div className="eyebrow mb-1">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="text-2xl sm:text-3xl font-bold">Hi {firstName} — production floor</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowChat((v) => !v)} className="px-3 py-2 text-sm rounded-lg border border-border bg-surface hover:bg-surface-hover">
            🤖 {showChat ? 'Hide chat' : 'Bot chat'}
          </button>
          <button onClick={() => setClosing(true)} disabled={dayClosed}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-40">
            {dayClosed ? 'Day closed ✓' : 'Close the day'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Pieces made today · {lanes.length} etcher{lanes.length > 1 ? 's' : ''} running</span>
          <span className="text-sm font-semibold">{madePieces} <span className="text-muted">/ {targetPieces} target</span></span>
        </div>
        <div className="h-3 rounded-full bg-background overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} /></div>
        <div className="flex gap-4 mt-3 text-xs text-muted">
          <span>{completedToday.length} jobs done</span>
          <span>{jobsLeft} in play</span>
          {problems.length > 0 && <span className="text-red-600 font-medium">{problems.length} problem{problems.length > 1 ? 's' : ''}</span>}
        </div>
        <p className="text-xs text-muted mt-2">Drag designs from <b>Ready</b> onto an etcher lane to start them. Drag jobs between lanes to reassign, reorder to change the order, or drop on <b>Done</b> / <b>Problem</b>.</p>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        {/* Board */}
        <div className="flex gap-3 overflow-x-auto pb-3 items-start">
          {/* Ready pool */}
          <Column title="Ready to make" count={readyConcepts.length} droppableId="ready" tone="accent">
            <div className="px-2 pb-2">
              <input value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} placeholder="Search designs…"
                className="w-full text-sm bg-background border border-border rounded-lg px-2 py-1.5 focus:outline-none focus:border-accent" />
            </div>
            {readyConcepts.length === 0 && (
              <p className="px-3 py-4 text-xs text-muted text-center">{pickSearch ? 'No matches.' : 'No approved designs waiting.'}</p>
            )}
            {readyConcepts.slice(0, 40).map((c, i) => (
              <Draggable key={c.id} draggableId={`${CONCEPT_PREFIX}${c.id}`} index={i}>
                {(p, snap) => (
                  <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                    className={`mx-2 mb-2 rounded-lg border bg-surface ${snap.isDragging ? 'border-accent shadow-lg' : 'border-border'}`}>
                    <ConceptRow concept={c} />
                  </div>
                )}
              </Draggable>
            ))}
          </Column>

          {/* Machine lanes */}
          {lanes.map((m) => {
            const laneJobs = jobsByMachine[m.id];
            const madeHere = completedToday.filter((j) => (j.machineId || lanes[0].id) === m.id).reduce((s, j) => s + (j.quantityCompleted || j.quantity || 0), 0);
            return (
              <Column key={m.id || 'unassigned'} title={m.name} count={laneJobs.length} droppableId={m.id} subtitle={`${madeHere}/${m.dailyPieceTarget || settings.dailyPieceTarget} pcs`}>
                {laneJobs.length === 0 && <p className="px-3 py-6 text-xs text-muted text-center">Drop a design or job here.</p>}
                {laneJobs.map((j, i) => (
                  <Draggable key={j.id} draggableId={j.id} index={i}>
                    {(p, snap) => (
                      <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps}
                        className={`mx-2 mb-2 ${snap.isDragging ? 'opacity-90' : ''}`}>
                        <LaneJob job={j} onStart={() => start(j)} onPause={() => pause(j)} onComplete={() => openComplete(j)} onProblem={(k) => flagProblem(j, k)} />
                      </div>
                    )}
                  </Draggable>
                ))}
              </Column>
            );
          })}

          {/* Backlog */}
          <Column title="Backlog" count={backlog.length} droppableId="backlog" tone="muted">
            {backlog.length === 0 && <p className="px-3 py-6 text-xs text-muted text-center">Unassigned jobs land here.</p>}
            {backlog.map((j, i) => (
              <Draggable key={j.id} draggableId={j.id} index={i}>
                {(p, snap) => (
                  <div ref={p.innerRef} {...p.draggableProps} {...p.dragHandleProps} className={`mx-2 mb-2 ${snap.isDragging ? 'opacity-90' : ''}`}>
                    <LaneJob job={j} compact onProblem={(k) => flagProblem(j, k)} />
                  </div>
                )}
              </Draggable>
            ))}
          </Column>
        </div>

        {/* Drop zones + problems + done */}
        <div className="grid sm:grid-cols-2 gap-3 mt-1">
          <Droppable droppableId="done">
            {(prov, snap) => (
              <div ref={prov.innerRef} {...prov.droppableProps}
                className={`rounded-xl border border-dashed p-3 min-h-[64px] ${snap.isDraggingOver ? 'border-emerald-500 bg-emerald-50' : 'border-border'}`}>
                <div className="text-sm font-semibold text-emerald-700 mb-1">✓ Done today ({completedToday.length})</div>
                <div className="flex flex-wrap gap-1.5">
                  {completedToday.length === 0 ? <span className="text-xs text-muted">Drop a job here to mark it done.</span> :
                    completedToday.map((j) => (
                      <span key={j.id} className="text-xs bg-white border border-emerald-200 rounded px-2 py-1">{j.title} · {j.quantityCompleted || j.quantity}{j.qcResult === 'fail' ? ' ⚠' : ''}</span>
                    ))}
                </div>
                {prov.placeholder}
              </div>
            )}
          </Droppable>
          <Droppable droppableId="problem">
            {(prov, snap) => (
              <div ref={prov.innerRef} {...prov.droppableProps}
                className={`rounded-xl border border-dashed p-3 min-h-[64px] ${snap.isDraggingOver ? 'border-red-500 bg-red-50' : 'border-border'}`}>
                <div className="text-sm font-semibold text-red-600 mb-1">⚑ Problems ({problems.length})</div>
                <div className="flex flex-col gap-1.5">
                  {problems.length === 0 ? <span className="text-xs text-muted">Drop a job here to flag a problem.</span> :
                    problems.map((j) => (
                      <div key={j.id} className="flex items-center justify-between gap-2 bg-white border border-red-200 rounded px-2 py-1">
                        <span className="text-xs truncate">{j.title} — {j.status === 'rework' ? (j.reworkReason || 'rework') : (j.notes?.split('\n').pop() || 'held')}</span>
                        <button onClick={() => resolveProblem(j)} className="shrink-0 text-[11px] text-red-700 underline">back to queue</button>
                      </div>
                    ))}
                </div>
                {prov.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      </DragDropContext>

      {/* Complete modal */}
      {completing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setCompleting(null)}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Complete “{completing.title}”</h3>
            <p className="text-sm text-muted mb-4">Log what you made and the quality check.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-sm"><span className="block text-muted mb-1">Pieces made</span>
                <input type="number" min={0} value={qtyMade} onChange={(e) => setQtyMade(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-background border border-border rounded-lg px-3 py-2" /></label>
              <label className="text-sm"><span className="block text-muted mb-1">Failed / scrap</span>
                <input type="number" min={0} value={qtyFailed} onChange={(e) => setQtyFailed(Math.max(0, parseInt(e.target.value) || 0))} className="w-full bg-background border border-border rounded-lg px-3 py-2" /></label>
            </div>
            <div className="mb-4">
              <span className="block text-sm text-muted mb-1.5">Quality check</span>
              <div className="flex gap-2">
                <button onClick={() => setQcResult('pass')} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${qcResult === 'pass' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-background border-border text-muted'}`}>✓ Pass</button>
                <button onClick={() => setQcResult('fail')} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${qcResult === 'fail' ? 'bg-red-600 text-white border-red-600' : 'bg-background border-border text-muted'}`}>✗ Fail</button>
              </div>
            </div>
            {qcResult === 'fail' && (
              <input value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} placeholder="What was wrong?" className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-4" />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCompleting(null)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
              <button onClick={submitComplete} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium">Save &amp; complete</button>
            </div>
          </div>
        </div>
      )}

      {/* Closeout modal */}
      {closing && (
        <CloseoutModal made={madePieces} target={targetPieces} left={jobsLeft} onClose={() => setClosing(false)}
          onConfirm={async (summary, unfinished) => {
            await closeOutDay(today, { completedSummary: summary, unfinishedSummary: unfinished, notes: '', completedPieces: madePieces, targetPieces, unfinishedJobs: jobsLeft });
            setClosing(false); toast('Day closed. Nice work! 🎉', 'success');
          }} />
      )}

      {/* Bot chat drawer */}
      {showChat && (
        <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-[380px] bg-surface border-l border-border shadow-2xl flex flex-col">
          <div className="flex items-center justify-between px-3 py-2 border-b border-border">
            <span className="text-sm font-semibold">Bot chat</span>
            <button onClick={() => setShowChat(false)} className="text-muted hover:text-foreground text-lg">×</button>
          </div>
          <div className="flex-1 overflow-hidden"><BotChat heightClass="h-full" compact /></div>
        </div>
      )}
    </div>
  );
}

// ── Column shell ────────────────────────────────────────────────────────────
function Column({
  title, subtitle, count, droppableId, tone, children,
}: {
  title: string; subtitle?: string; count: number; droppableId: string;
  tone?: 'accent' | 'muted'; children: ReactNode;
}) {
  return (
    <div className="shrink-0 w-[280px] bg-background border border-border rounded-xl flex flex-col max-h-[70vh]">
      <div className={`px-3 py-2 border-b border-border flex items-center justify-between ${tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-muted' : ''}`}>
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted">{subtitle || count}</span>
      </div>
      <Droppable droppableId={droppableId}>
        {(prov, snap) => (
          <div ref={prov.innerRef} {...prov.droppableProps}
            className={`flex-1 overflow-y-auto py-2 ${snap.isDraggingOver ? 'bg-accent/5' : ''}`}>
            {children}
            {prov.placeholder}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// ── Approved-design row (in Ready pool) ─────────────────────────────────────
function ConceptRow({ concept }: { concept: Concept }) {
  const img = concept.coilImageUrl || concept.combinedImageUrl || concept.baseImageUrl || '';
  return (
    <div className="flex items-center gap-2 p-2">
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" className="w-10 h-10 rounded object-cover bg-background border border-border shrink-0" />
      ) : (
        <div className="w-10 h-10 rounded bg-background border border-border shrink-0 flex items-center justify-center text-[9px] text-muted">no art</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight line-clamp-1">{concept.name}</div>
        <div className="text-[11px] text-muted flex items-center gap-1.5">
          {concept.highlighted && <span className="text-amber-400">★</span>}
          <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[concept.priority] || 'bg-slate-300'}`} />
          <span>{concept.status === 'ready_for_manufacturing' ? 'Ready' : 'Approved'}</span>
        </div>
      </div>
      <span className="text-muted text-xs shrink-0">⠿</span>
    </div>
  );
}

// ── Lane job card ───────────────────────────────────────────────────────────
function LaneJob({
  job, compact, onStart, onPause, onComplete, onProblem,
}: {
  job: ProductionJob; compact?: boolean;
  onStart?: () => void; onPause?: () => void; onComplete?: () => void; onProblem?: (k: 'held' | 'rework') => void;
}) {
  const running = job.status === 'in_progress';
  return (
    <div className={`rounded-lg border bg-surface p-2 ${running ? 'border-accent ring-1 ring-accent/30' : 'border-border'}`}>
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[job.priority] || 'bg-slate-300'}`} />
        <span className="text-sm font-semibold truncate flex-1">{job.title}</span>
        {job.rush && <span className="text-[10px] text-red-600 font-bold">RUSH</span>}
      </div>
      <div className="text-[11px] text-muted mt-0.5 flex flex-wrap gap-x-2">
        {job.textName && <span>“{job.textName}”</span>}
        <span>Qty {job.quantity}</span>
        {job.customerName && <span className="truncate">{job.customerName}</span>}
      </div>
      {running && <div className="text-[11px] text-accent mt-0.5">▶ Running · {fmtMinutes((job.accumulatedMinutes || 0) + minutesSince(job.actualStartTime))}</div>}
      {job.status === 'paused' && <div className="text-[11px] text-amber-600 mt-0.5">⏸ Paused</div>}
      {!compact && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {onStart && !running && <button onClick={onStart} className="px-2.5 py-1 text-xs font-medium rounded-md bg-accent hover:bg-accent-hover text-white">▶ {job.status === 'paused' ? 'Resume' : 'Start'}</button>}
          {onPause && running && <button onClick={onPause} className="px-2.5 py-1 text-xs font-medium rounded-md bg-background border border-border hover:bg-surface-hover">⏸</button>}
          {onComplete && <button onClick={onComplete} className="px-2.5 py-1 text-xs font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white">✓ Done</button>}
          {onProblem && <button onClick={() => onProblem('held')} className="px-2.5 py-1 text-xs font-medium rounded-md bg-background border border-border text-red-600 hover:bg-red-50">⚑</button>}
        </div>
      )}
    </div>
  );
}

// ── Closeout modal ──────────────────────────────────────────────────────────
function CloseoutModal({
  made, target, left, onClose, onConfirm,
}: {
  made: number; target: number; left: number;
  onClose: () => void; onConfirm: (summary: string, unfinished: string) => void;
}) {
  const [summary, setSummary] = useState(`Made ${made} of ${target} pieces.`);
  const [unfinished, setUnfinished] = useState(left > 0 ? `${left} job${left > 1 ? 's' : ''} still in play.` : 'Everything scheduled got done.');
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Close the day</h3>
        <p className="text-sm text-muted mb-4">A quick recap for you and the bot. {made}/{target} pieces · {left} left.</p>
        <label className="block text-sm mb-3"><span className="block text-muted mb-1">What got made</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></label>
        <label className="block text-sm mb-4"><span className="block text-muted mb-1">What didn&apos;t (and why)</span>
          <textarea value={unfinished} onChange={(e) => setUnfinished(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" /></label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
          <button onClick={() => onConfirm(summary, unfinished)} className="px-4 py-2 text-sm bg-foreground text-background rounded-lg font-medium hover:opacity-90">Close day</button>
        </div>
      </div>
    </div>
  );
}
