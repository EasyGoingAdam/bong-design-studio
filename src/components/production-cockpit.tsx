'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { BotChat } from './bot-chat';
import { todayKey, fmtMinutes } from '@/lib/production';
import { ProductionJob, PriorityLevel, REWORK_REASONS, COIL_SIZE_LABELS, Concept } from '@/lib/types';

const PRIORITY_DOT: Record<PriorityLevel, string> = {
  urgent: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-amber-400',
  low: 'bg-slate-300',
};

const minutesSince = (iso?: string) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : 0);

/**
 * Production Cockpit — the streamlined home screen for the manufacturing tech.
 * Everything they do in a shift is one tap: work the queue (start/pause/
 * complete with QC), flag a problem, talk to the bot, and close the day.
 * The full design studio lives behind the "Studio" switch for admins.
 *
 * Every action here maps 1:1 to a bot-callable action on /api/bot/production,
 * so the bot and the tech operate on the exact same jobs and statuses.
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
  const [starting, setStarting] = useState<string | null>(null); // conceptId being added

  // Complete flow modal state.
  const [completing, setCompleting] = useState<ProductionJob | null>(null);
  const [qtyMade, setQtyMade] = useState(0);
  const [qtyFailed, setQtyFailed] = useState(0);
  const [qcResult, setQcResult] = useState<'pass' | 'fail'>('pass');
  const [qcNotes, setQcNotes] = useState('');
  const [showChat, setShowChat] = useState(false); // mobile toggle
  const [closing, setClosing] = useState(false);

  // ── Today's work ────────────────────────────────────────────────────────
  const { active, queue, completedToday, problems, targetPieces, madePieces } = useMemo(() => {
    const isToday = (j: ProductionJob) => j.scheduledDate === today;
    const active = productionJobs.find((j) => j.status === 'in_progress') || null;
    const paused = productionJobs.filter((j) => j.status === 'paused');
    // Jobs to work today: scheduled/backlog for today, plus any paused, minus the active one.
    const upNext = productionJobs
      .filter((j) => (j.status === 'scheduled' || j.status === 'backlog') && isToday(j))
      .sort((a, b) => (a.scheduledPosition ?? 0) - (b.scheduledPosition ?? 0));
    const queue = [...paused, ...upNext].filter((j) => j.id !== active?.id);
    const completedToday = productionJobs.filter((j) => j.status === 'completed' && isToday(j));
    const problems = productionJobs.filter((j) => j.status === 'held' || j.status === 'rework');

    const activeMachines = machines.filter((m) => m.active);
    const targetPieces =
      activeMachines.reduce((s, m) => s + (m.dailyPieceTarget || settings.dailyPieceTarget || 0), 0) ||
      settings.dailyPieceTarget ||
      0;
    const madePieces = completedToday.reduce((s, j) => s + (j.quantityCompleted || j.quantity || 0), 0);
    return { active, queue, completedToday, problems, targetPieces, madePieces };
  }, [productionJobs, machines, settings, today]);

  // Approved designs the tech can pull work from — anything approved / ready for
  // manufacturing that doesn't already have an open (non-completed) job.
  const readyConcepts = useMemo(() => {
    const openConceptIds = new Set(
      productionJobs.filter((j) => j.status !== 'completed' && j.conceptId).map((j) => j.conceptId as string),
    );
    const term = pickSearch.trim().toLowerCase();
    return concepts
      .filter((c) => c.status === 'approved' || c.status === 'ready_for_manufacturing')
      .filter((c) => !openConceptIds.has(c.id))
      .filter((c) => !term || c.name.toLowerCase().includes(term) || (c.tags || []).some((t) => t.toLowerCase().includes(term)))
      .sort((a, b) => {
        // Highlighted first, then higher priority, then newest.
        const rank: Record<PriorityLevel, number> = { urgent: 3, high: 2, medium: 1, low: 0 };
        if (!!b.highlighted !== !!a.highlighted) return b.highlighted ? 1 : -1;
        return (rank[b.priority] ?? 0) - (rank[a.priority] ?? 0) || (b.updatedAt || '').localeCompare(a.updatedAt || '');
      });
  }, [concepts, productionJobs, pickSearch]);

  const todayRow = scheduleDays.find((d) => d.date === today);
  const dayClosed = !!todayRow?.closed;

  // ── Actions (all funnel through updateProductionJob) ────────────────────
  const start = (j: ProductionJob) =>
    updateProductionJob(j.id, { status: 'in_progress', actualStartTime: new Date().toISOString(), scheduledDate: j.scheduledDate || today });

  const pause = (j: ProductionJob) =>
    updateProductionJob(j.id, {
      status: 'paused',
      accumulatedMinutes: (j.accumulatedMinutes || 0) + (j.status === 'in_progress' ? minutesSince(j.actualStartTime) : 0),
      pauseCount: (j.pauseCount || 0) + 1,
    });

  const openComplete = (j: ProductionJob) => {
    setCompleting(j);
    setQtyMade(j.quantityCompleted || j.quantity || 1);
    setQtyFailed(0);
    setQcResult('pass');
    setQcNotes('');
  };

  const submitComplete = async () => {
    if (!completing) return;
    const j = completing;
    const extra = j.status === 'in_progress' ? minutesSince(j.actualStartTime) : 0;
    await updateProductionJob(j.id, {
      status: 'completed',
      actualEndTime: new Date().toISOString(),
      actualTotalMinutes: (j.accumulatedMinutes || 0) + extra,
      quantityCompleted: qtyMade,
      quantityFailed: qtyFailed,
      qcResult,
      qcNotes,
      scheduledDate: j.scheduledDate || today,
    });
    setCompleting(null);
    toast(qcResult === 'pass' ? 'Job completed ✓' : 'Completed — QC flagged', qcResult === 'pass' ? 'success' : 'info');
  };

  const flagProblem = (j: ProductionJob, kind: 'held' | 'rework') => {
    const reason = kind === 'rework'
      ? window.prompt(`Rework reason? (e.g. ${REWORK_REASONS.slice(0, 3).join(', ')})`, '')
      : window.prompt('What went wrong? (this is visible to the team + bot)', '');
    if (reason === null) return; // cancelled
    if (kind === 'rework') {
      updateProductionJob(j.id, { status: 'rework', reworkReason: reason || 'Unspecified' });
    } else {
      const stamped = `${j.notes ? j.notes + '\n' : ''}[HELD ${today}] ${reason || 'Unspecified'}`;
      updateProductionJob(j.id, { status: 'held', notes: stamped });
    }
    toast(kind === 'rework' ? 'Marked for rework' : 'Flagged as a problem', 'info');
  };

  const resolveProblem = (j: ProductionJob) =>
    updateProductionJob(j.id, { status: 'scheduled', scheduledDate: today });

  // Pull a job from an approved design. `startNow` starts it immediately (only
  // offered when nothing is already running); otherwise it lands in today's queue.
  const pickConcept = async (c: Concept, startNow: boolean) => {
    if (starting) return;
    setStarting(c.id);
    try {
      const lc = c.specs?.laserComplexity || 3;
      const complexity = lc <= 1 ? 'low' : lc <= 3 ? 'medium' : lc === 4 ? 'high' : 'very_high';
      const created = await addProductionJob({
        title: c.name,
        sourceType: 'workflow',
        conceptId: c.id,
        designName: c.name,
        designImageUrl: c.coilImageUrl || c.combinedImageUrl || c.baseImageUrl || '',
        productType: c.collection || '',
        complexity: complexity as ProductionJob['complexity'],
        priority: c.priority,
        tags: Array.from(new Set([...(c.tags || []), 'One of Ones'])),
        designNotes: c.manufacturingNotes || c.description || '',
        quantity: 1,
        scheduledDate: today,
        status: startNow ? 'in_progress' : 'scheduled',
        ...(startNow ? { actualStartTime: new Date().toISOString() } : {}),
      });
      if (created) toast(startNow ? `Started “${created.title}” ▶` : `Queued “${created.title}”`, 'success');
      else toast('Could not create the job', 'error');
    } finally {
      setStarting(null);
    }
  };

  const doCloseout = async (summary: string, unfinishedNote: string) => {
    await closeOutDay(today, {
      completedSummary: summary,
      unfinishedSummary: unfinishedNote,
      notes: '',
      completedPieces: madePieces,
      targetPieces,
      unfinishedJobs: queue.length + (active ? 1 : 0),
    });
    setClosing(false);
    toast('Day closed. Nice work! 🎉', 'success');
  };

  const pct = targetPieces > 0 ? Math.min(100, Math.round((madePieces / targetPieces) * 100)) : 0;
  const firstName = (currentUser?.name || '').split(' ')[0] || 'there';

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6">
      {/* Greeting + day progress */}
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <div className="eyebrow mb-1">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
          <h1 className="text-2xl sm:text-3xl font-bold">Hi {firstName} — here&apos;s today</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowChat((v) => !v)}
            className="lg:hidden px-3 py-2 text-sm rounded-lg border border-border bg-surface hover:bg-surface-hover"
          >
            🤖 {showChat ? 'Hide chat' : 'Bot chat'}
          </button>
          <button
            onClick={() => setClosing(true)}
            disabled={dayClosed}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-foreground text-background hover:opacity-90 disabled:opacity-40"
          >
            {dayClosed ? 'Day closed ✓' : 'Close the day'}
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="bg-surface border border-border rounded-xl p-4 mb-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted">Pieces made today</span>
          <span className="text-sm font-semibold">
            {madePieces} <span className="text-muted">/ {targetPieces} target</span>
          </span>
        </div>
        <div className="h-3 rounded-full bg-background overflow-hidden">
          <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex gap-4 mt-3 text-xs text-muted">
          <span>{completedToday.length} jobs done</span>
          <span>{queue.length + (active ? 1 : 0)} left</span>
          {problems.length > 0 && <span className="text-red-600 font-medium">{problems.length} problem{problems.length > 1 ? 's' : ''}</span>}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr,380px] gap-5 items-start">
        {/* LEFT: the work */}
        <div className="space-y-5">
          {/* Current job */}
          <section>
            <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">Now working</h2>
            {active ? (
              <JobCard job={active} big onPause={() => pause(active)} onComplete={() => openComplete(active)} onProblem={(k) => flagProblem(active, k)} />
            ) : queue.length > 0 ? (
              <div className="bg-surface border border-dashed border-border rounded-xl p-5 text-center">
                <p className="text-sm text-muted mb-3">Nothing running. Start the next job below.</p>
                <button onClick={() => start(queue[0])} className="px-5 py-2.5 bg-accent hover:bg-accent-hover text-white rounded-lg font-medium">
                  ▶ Start “{queue[0].title}”
                </button>
              </div>
            ) : readyConcepts.length > 0 ? (
              <div className="bg-surface border border-dashed border-border rounded-xl p-5 text-center">
                <p className="text-sm font-medium">Nothing running.</p>
                <p className="text-sm text-muted mt-1">Pick your next piece from the approved designs below 👇</p>
              </div>
            ) : (
              <div className="bg-surface border border-border rounded-xl p-6 text-center">
                <p className="text-lg font-medium">All caught up 🎉</p>
                <p className="text-sm text-muted mt-1">No jobs queued and no approved designs waiting.</p>
              </div>
            )}
          </section>

          {/* Up next queue */}
          {queue.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">Up next ({queue.length})</h2>
              <div className="space-y-2">
                {queue.map((j) => (
                  <JobCard key={j.id} job={j} onStart={() => start(j)} onProblem={(k) => flagProblem(j, k)} />
                ))}
              </div>
            </section>
          )}

          {/* Choose your next piece — pull work from approved designs */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-2">
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide">Choose your next piece ({readyConcepts.length})</h2>
              {concepts.some((c) => c.status === 'approved' || c.status === 'ready_for_manufacturing') && (
                <input
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                  placeholder="Search designs…"
                  className="text-sm bg-background border border-border rounded-lg px-3 py-1.5 w-40 focus:outline-none focus:border-accent"
                />
              )}
            </div>
            {readyConcepts.length === 0 ? (
              <div className="bg-surface border border-dashed border-border rounded-xl p-5 text-center text-sm text-muted">
                {pickSearch ? 'No approved designs match your search.' : 'No approved designs waiting. Once designs are approved they show up here to make.'}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {readyConcepts.slice(0, 18).map((c) => (
                  <PickCard
                    key={c.id}
                    concept={c}
                    busy={starting === c.id}
                    canStartNow={!active}
                    onStart={() => pickConcept(c, true)}
                    onQueue={() => pickConcept(c, false)}
                  />
                ))}
              </div>
            )}
            {readyConcepts.length > 18 && (
              <p className="text-xs text-muted mt-2">Showing 18 of {readyConcepts.length}. Search to narrow.</p>
            )}
          </section>

          {/* Problems */}
          {problems.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-red-600 uppercase tracking-wide mb-2">Problems ({problems.length})</h2>
              <div className="space-y-2">
                {problems.map((j) => (
                  <div key={j.id} className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{j.title}</div>
                      <div className="text-xs text-red-700 truncate">
                        {j.status === 'rework' ? `Rework: ${j.reworkReason || '—'}` : (j.notes?.split('\n').pop() || 'Held')}
                      </div>
                    </div>
                    <button onClick={() => resolveProblem(j)} className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-red-300 text-red-700 hover:bg-red-100">
                      Back to queue
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Completed today */}
          {completedToday.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-muted uppercase tracking-wide mb-2">Done today ({completedToday.length})</h2>
              <div className="space-y-1.5">
                {completedToday.map((j) => (
                  <div key={j.id} className="flex items-center gap-2 text-sm text-muted">
                    <span className="text-emerald-600">✓</span>
                    <span className="truncate">{j.title}</span>
                    <span className="ml-auto shrink-0 text-xs">{j.quantityCompleted || j.quantity} pc{j.qcResult === 'fail' ? ' · QC⚠' : ''}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* RIGHT: bot chat (always on desktop, toggle on mobile) */}
        <aside className={`${showChat ? 'block' : 'hidden'} lg:block lg:sticky lg:top-4`}>
          <div className="border border-border rounded-xl overflow-hidden h-[560px] bg-surface">
            <BotChat heightClass="h-full" compact />
          </div>
        </aside>
      </div>

      {/* Complete modal */}
      {completing && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setCompleting(null)}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Complete “{completing.title}”</h3>
            <p className="text-sm text-muted mb-4">Log what you made and the quality check.</p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="text-sm">
                <span className="block text-muted mb-1">Pieces made</span>
                <input type="number" min={0} value={qtyMade} onChange={(e) => setQtyMade(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2" />
              </label>
              <label className="text-sm">
                <span className="block text-muted mb-1">Failed / scrap</span>
                <input type="number" min={0} value={qtyFailed} onChange={(e) => setQtyFailed(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full bg-background border border-border rounded-lg px-3 py-2" />
              </label>
            </div>
            <div className="mb-4">
              <span className="block text-sm text-muted mb-1.5">Quality check</span>
              <div className="flex gap-2">
                <button onClick={() => setQcResult('pass')} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${qcResult === 'pass' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-background border-border text-muted'}`}>✓ Pass</button>
                <button onClick={() => setQcResult('fail')} className={`flex-1 py-2 rounded-lg text-sm font-medium border ${qcResult === 'fail' ? 'bg-red-600 text-white border-red-600' : 'bg-background border-border text-muted'}`}>✗ Fail</button>
              </div>
            </div>
            {qcResult === 'fail' && (
              <input value={qcNotes} onChange={(e) => setQcNotes(e.target.value)} placeholder="What was wrong?"
                className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm mb-4" />
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setCompleting(null)} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
              <button onClick={submitComplete} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium">Save & complete</button>
            </div>
          </div>
        </div>
      )}

      {/* Closeout modal */}
      {closing && (
        <CloseoutModal
          made={madePieces}
          target={targetPieces}
          left={queue.length + (active ? 1 : 0)}
          onClose={() => setClosing(false)}
          onConfirm={doCloseout}
        />
      )}
    </div>
  );
}

// ── Job card ──────────────────────────────────────────────────────────────
function JobCard({
  job, big, onStart, onPause, onComplete, onProblem,
}: {
  job: ProductionJob;
  big?: boolean;
  onStart?: () => void;
  onPause?: () => void;
  onComplete?: () => void;
  onProblem?: (kind: 'held' | 'rework') => void;
}) {
  return (
    <div className={`bg-surface border rounded-xl ${big ? 'border-accent p-4' : 'border-border p-3'} flex gap-3`}>
      {job.designImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={job.designImageUrl} alt="" className={`${big ? 'w-24 h-24' : 'w-14 h-14'} rounded-lg object-cover bg-background border border-border shrink-0`} />
      ) : (
        <div className={`${big ? 'w-24 h-24' : 'w-14 h-14'} rounded-lg bg-background border border-border shrink-0 flex items-center justify-center text-muted text-xs`}>no art</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[job.priority] || 'bg-slate-300'}`} />
          <span className={`font-semibold truncate ${big ? 'text-lg' : ''}`}>{job.title}</span>
        </div>
        <div className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
          {job.textName && <span>Text: “{job.textName}”</span>}
          {job.coilSize && <span>{COIL_SIZE_LABELS[job.coilSize]}</span>}
          <span>Qty {job.quantity}</span>
          {job.customerName && <span>{job.customerName}</span>}
          {job.rush && <span className="text-red-600 font-medium">RUSH</span>}
        </div>
        {big && job.machineSettings && (
          <div className="text-xs text-muted mt-1">⚙ {job.machineSettings}</div>
        )}
        {big && job.status === 'in_progress' && (
          <div className="text-xs text-accent mt-1">Running · {fmtMinutes((job.accumulatedMinutes || 0) + minutesSince(job.actualStartTime))}</div>
        )}
        {job.status === 'paused' && <div className="text-xs text-amber-600 mt-1">Paused</div>}

        {/* Actions */}
        <div className="flex flex-wrap gap-2 mt-2">
          {onStart && (
            <button onClick={onStart} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-accent hover:bg-accent-hover text-white">
              ▶ {job.status === 'paused' ? 'Resume' : 'Start'}
            </button>
          )}
          {onPause && (
            <button onClick={onPause} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-background border border-border hover:bg-surface-hover">⏸ Pause</button>
          )}
          {onComplete && (
            <button onClick={onComplete} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">✓ Complete</button>
          )}
          {onProblem && (
            <>
              <button onClick={() => onProblem('held')} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-background border border-border text-red-600 hover:bg-red-50">⚑ Problem</button>
              <button onClick={() => onProblem('rework')} className="px-3 py-1.5 text-sm font-medium rounded-lg bg-background border border-border text-amber-700 hover:bg-amber-50">↻ Rework</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Approved-design pick card ───────────────────────────────────────────────
function PickCard({
  concept, busy, canStartNow, onStart, onQueue,
}: {
  concept: Concept;
  busy: boolean;
  canStartNow: boolean;
  onStart: () => void;
  onQueue: () => void;
}) {
  const img = concept.coilImageUrl || concept.combinedImageUrl || concept.baseImageUrl || '';
  return (
    <div className="bg-surface border border-border rounded-xl overflow-hidden flex flex-col">
      <div className="aspect-square bg-background relative">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted text-xs">no art</div>
        )}
        {concept.highlighted && <span className="absolute top-1 left-1 text-amber-400 text-sm">★</span>}
        {concept.status === 'ready_for_manufacturing' && (
          <span className="absolute top-1 right-1 text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded">READY</span>
        )}
      </div>
      <div className="p-2 flex flex-col gap-1.5 flex-1">
        <div className="text-sm font-medium leading-tight line-clamp-2">{concept.name}</div>
        <div className="mt-auto flex gap-1.5">
          {canStartNow && (
            <button onClick={onStart} disabled={busy}
              className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-accent hover:bg-accent-hover text-white disabled:opacity-50">
              {busy ? '…' : '▶ Start'}
            </button>
          )}
          <button onClick={onQueue} disabled={busy}
            className={`${canStartNow ? '' : 'flex-1'} px-2 py-1.5 text-xs font-medium rounded-lg bg-background border border-border hover:bg-surface-hover disabled:opacity-50`}>
            {busy && !canStartNow ? '…' : '＋ Queue'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Closeout modal ──────────────────────────────────────────────────────────
function CloseoutModal({
  made, target, left, onClose, onConfirm,
}: {
  made: number; target: number; left: number;
  onClose: () => void;
  onConfirm: (summary: string, unfinished: string) => void;
}) {
  const [summary, setSummary] = useState(`Made ${made} of ${target} pieces.`);
  const [unfinished, setUnfinished] = useState(left > 0 ? `${left} job${left > 1 ? 's' : ''} left in the queue.` : 'Everything scheduled got done.');
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-1">Close the day</h3>
        <p className="text-sm text-muted mb-4">A quick recap for you and the bot. {made}/{target} pieces · {left} left.</p>
        <label className="block text-sm mb-3">
          <span className="block text-muted mb-1">What got made</span>
          <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </label>
        <label className="block text-sm mb-4">
          <span className="block text-muted mb-1">What didn&apos;t (and why)</span>
          <textarea value={unfinished} onChange={(e) => setUnfinished(e.target.value)} rows={2} className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm" />
        </label>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
          <button onClick={() => onConfirm(summary, unfinished)} className="px-4 py-2 text-sm bg-foreground text-background rounded-lg font-medium hover:opacity-90">Close day</button>
        </div>
      </div>
    </div>
  );
}
