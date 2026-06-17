'use client';

import { useMemo, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { ProductionJobModal } from './production-job-modal';
import { ProductionReports } from './production-reports';
import { ProductionCalendar } from './production-calendar';
import { ProductionSettingsModal } from './production-settings-modal';
import { ProductionCloseoutModal } from './production-closeout-modal';
import { ConfirmDialog } from './confirm-dialog';
import { workdayHours } from '@/lib/types';
import {
  ProductionJob,
  Machine,
  PRODUCTION_STATUS_LABELS,
  COMPLEXITY_LABELS,
  OVERRIDE_REASONS,
  REWORK_REASONS,
} from '@/lib/types';
import {
  todayKey,
  addDays,
  fmtMinutes,
  jobTotalMinutes,
  totalPieces,
  computeMachineLoad,
  computeScheduleWarnings,
  daysUntil,
  slaStatus,
  jobBlockedState,
} from '@/lib/production';

const PRIORITY_DOT: Record<string, string> = {
  low: 'bg-border', medium: 'bg-blue-400', high: 'bg-amber-500', urgent: 'bg-red-500',
};
const COMPLEXITY_BADGE: Record<string, string> = {
  low: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-blue-50 text-blue-700 border-blue-200',
  high: 'bg-amber-50 text-amber-800 border-amber-200',
  very_high: 'bg-red-50 text-red-700 border-red-200',
};

export function ManufacturingBoard() {
  const {
    productionJobs, machines, scheduleDays, currentUser, concepts, openAIKey, productionSettings,
    updateProductionJob, deleteProductionJob, addProductionJob, lockScheduleDay, setScheduleDay,
    reopenDay,
  } = useAppStore();
  const { toast } = useToast();

  const isAdmin = currentUser.role === 'admin';
  const [viewedDate, setViewedDate] = useState<string>(todayKey());
  const [modalJob, setModalJob] = useState<ProductionJob | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [aiBusy, setAiBusy] = useState<'schedule' | 'review' | null>(null);
  const [aiReview, setAiReview] = useState<{ approved_to_lock: boolean; issues: string[]; recommended_changes: string[] } | null>(null);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'calendar' | 'reports'>('board');
  const [showSettings, setShowSettings] = useState(false);
  const [showCloseout, setShowCloseout] = useState(false);

  const activeMachines = useMemo(
    () => machines.filter((m) => m.active).sort((a, b) => a.position - b.position),
    [machines],
  );

  const scheduleDay = scheduleDays.find((d) => d.date === viewedDate);
  const locked = !!scheduleDay?.locked;
  const closed = !!scheduleDay?.closed;

  // Partition jobs for the viewed day.
  const dayJobs = useMemo(
    () => productionJobs.filter((j) => j.scheduledDate === viewedDate),
    [productionJobs, viewedDate],
  );
  const backlog = useMemo(
    () => productionJobs
      .filter((j) => !j.scheduledDate && j.status !== 'completed')
      .sort((a, b) => {
        const pr: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
        if (a.rush !== b.rush) return a.rush ? -1 : 1;
        return (pr[a.priority] ?? 2) - (pr[b.priority] ?? 2);
      }),
    [productionJobs],
  );
  const completed = dayJobs.filter((j) => j.status === 'completed');
  const held = dayJobs.filter((j) => j.status === 'held');

  const jobsByMachine = (mid: string) =>
    dayJobs
      .filter((j) => j.machineId === mid && ['scheduled', 'in_progress', 'paused', 'rework'].includes(j.status))
      .sort((a, b) => a.scheduledPosition - b.scheduledPosition);

  // Daily summary.
  const summary = useMemo(() => {
    const scheduledActive = dayJobs.filter((j) => j.status !== 'held');
    const targetPieces = activeMachines.reduce((s, m) => s + (m.dailyPieceTarget || 4), 0) || 8;
    const scheduledPieces = totalPieces(scheduledActive);
    const completedPieces = completed.reduce((s, j) => s + (j.quantityCompleted || j.quantity), 0);
    const estMinutes = scheduledActive.reduce((s, j) => s + jobTotalMinutes(j), 0);
    const actualMinutes = completed.reduce((s, j) => s + (j.actualTotalMinutes || 0), 0);
    const reworkCount = dayJobs.filter((j) => j.status === 'rework').length;
    const revenueScheduled = scheduledActive.reduce((s, j) => s + (j.revenueValue || 0), 0);
    const revenueCompleted = completed.reduce((s, j) => s + (j.revenueValue || 0), 0);
    const unfinished = dayJobs.filter((j) => !['completed'].includes(j.status) && j.status !== 'held').length;
    return {
      targetPieces, scheduledPieces, completedPieces, estMinutes, actualMinutes,
      reworkCount, revenueScheduled, revenueCompleted, unfinished,
      behind: completedPieces < targetPieces,
    };
  }, [dayJobs, completed, activeMachines]);

  const warnings = useMemo(
    () => computeScheduleWarnings(activeMachines, dayJobs, backlog, viewedDate),
    [activeMachines, dayJobs, backlog, viewedDate],
  );

  // 7-day capacity forecast.
  const forecast = useMemo(() => {
    const totalDailyMin = activeMachines.reduce((s, m) => s + (m.dailyHours || 8) * 60, 0) || 960;
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(todayKey(), i);
      const jobs = productionJobs.filter((j) => j.scheduledDate === date && j.status !== 'held');
      const minutes = jobs.reduce((s, j) => s + jobTotalMinutes(j), 0);
      return {
        date, pieces: totalPieces(jobs), minutes, capacity: totalDailyMin,
        overBy: minutes > totalDailyMin ? minutes - totalDailyMin : 0,
      };
    });
  }, [productionJobs, activeMachines]);

  // Concepts eligible to become production jobs (approved / ready, not already linked).
  const eligibleConcepts = useMemo(() => {
    const linked = new Set(productionJobs.map((j) => j.conceptId).filter(Boolean));
    return concepts.filter(
      (c) => ['approved', 'ready_for_manufacturing'].includes(c.status) && !linked.has(c.id),
    );
  }, [concepts, productionJobs]);

  // ── Drag handling ───────────────────────────────────────────────────────
  const onDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    if (locked && !isAdmin) {
      toast('Schedule is locked — only an admin can change it.', 'error');
      return;
    }
    let overrideReason: string | undefined;
    if (locked) {
      const reason = window.prompt(`Schedule is locked. Reason for this change?\nOptions: ${OVERRIDE_REASONS.join(', ')}`);
      if (!reason) return;
      overrideReason = reason;
    }

    const dest = destination.droppableId;
    const patch: Record<string, unknown> = { scheduledPosition: destination.index };
    if (dest === 'backlog') {
      patch.scheduledDate = null; patch.machineId = null; patch.status = 'backlog';
    } else if (dest === 'held') {
      patch.scheduledDate = viewedDate; patch.status = 'held';
    } else if (dest === 'completed') {
      patch.scheduledDate = viewedDate; patch.status = 'completed';
      const job = productionJobs.find((j) => j.id === draggableId);
      if (job && !job.quantityCompleted) patch.quantityCompleted = job.quantity;
    } else {
      // machine column
      patch.machineId = dest; patch.scheduledDate = viewedDate;
      const job = productionJobs.find((j) => j.id === draggableId);
      if (!job || job.status === 'backlog' || !job.status) patch.status = 'scheduled';
      else if (job.status === 'held') patch.status = 'scheduled';
    }
    if (overrideReason) patch.overrideReason = overrideReason;
    await updateProductionJob(draggableId, patch as Partial<ProductionJob>);
  };

  // ── Job lifecycle actions ────────────────────────────────────────────────
  const minutesSince = (iso?: string) => (iso ? Math.round((Date.now() - new Date(iso).getTime()) / 60000) : 0);

  const startJob = (j: ProductionJob) =>
    updateProductionJob(j.id, {
      status: 'in_progress',
      actualStartTime: new Date().toISOString(),
      ...(j.actualStartTime ? {} : {}),
    });

  const pauseJob = (j: ProductionJob) =>
    updateProductionJob(j.id, {
      status: 'paused',
      accumulatedMinutes: (j.accumulatedMinutes || 0) + minutesSince(j.actualStartTime),
    });

  const completeJob = (j: ProductionJob) => {
    const extra = j.status === 'in_progress' ? minutesSince(j.actualStartTime) : 0;
    updateProductionJob(j.id, {
      status: 'completed',
      actualEndTime: new Date().toISOString(),
      actualTotalMinutes: (j.accumulatedMinutes || 0) + extra,
      quantityCompleted: j.quantityCompleted || j.quantity,
      scheduledDate: j.scheduledDate || viewedDate,
    });
  };

  const holdJob = (j: ProductionJob) => {
    const reason = window.prompt('Problem / hold reason?') || '';
    updateProductionJob(j.id, { status: 'held', notes: reason ? `${j.notes}\n[HELD] ${reason}`.trim() : j.notes });
  };

  const reworkJob = (j: ProductionJob) => {
    const reason = window.prompt(`Rework reason? (${REWORK_REASONS.join(', ')})`) || '';
    updateProductionJob(j.id, { status: 'rework', reworkReason: reason });
  };

  // ── Lock / unlock ─────────────────────────────────────────────────────────
  const toggleLock = async () => {
    if (!isAdmin) return;
    await lockScheduleDay(viewedDate, !locked);
    toast(locked ? 'Schedule unlocked' : 'Today’s schedule locked', 'success');
  };

  // ── AI: generate draft schedule ────────────────────────────────────────────
  const generateAISchedule = async () => {
    if (!isAdmin) return;
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    if (locked) { toast('Unlock the schedule before regenerating with AI.', 'error'); return; }
    setAiBusy('schedule'); setAiSummary(null); setAiReview(null);
    try {
      // Candidates: backlog (inventory available) + jobs already on this day.
      const candidates = [
        ...dayJobs.filter((j) => j.status !== 'completed'),
        ...backlog.filter((j) => j.inventoryAvailable),
      ].slice(0, productionSettings.maxJobsPerPlan);
      const res = await fetch('/api/production/ai-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: viewedDate,
          jobs: candidates,
          machines: activeMachines,
          apiKey: openAIKey,
          model: productionSettings.model,
          settings: {
            workdayStart: productionSettings.workdayStart,
            workdayHours: workdayHours(productionSettings),
            bufferPct: productionSettings.bufferPct,
            dailyPieceTarget: productionSettings.dailyPieceTarget,
            weights: {
              dueDate: productionSettings.dueDateWeight,
              revenue: productionSettings.revenueWeight,
              rushBoost: productionSettings.rushBoost,
              complexitySpread: productionSettings.complexityPenalty,
              testingPriority: productionSettings.testingPriority,
            },
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'AI schedule failed', 'error'); return; }

      // Apply the draft: assign each job to its machine/position for the day.
      const assigns = data.assignments || [];
      for (const a of assigns) {
        await updateProductionJob(a.job_id, {
          machineId: a.machine_id,
          scheduledDate: viewedDate,
          scheduledPosition: a.position ?? 0,
          status: 'scheduled',
          aiReasoning: a.priority_reason || '',
        });
      }
      const s = data.daily_summary || {};
      const unsched = (data.unscheduled || []).length;
      setAiSummary(
        `AI scheduled ${assigns.length} job(s)` +
        (unsched ? `, left ${unsched} unscheduled` : '') +
        (s.risk_level ? ` · risk: ${s.risk_level}` : '') +
        (Array.isArray(s.risk_notes) && s.risk_notes.length ? ` — ${s.risk_notes[0]}` : ''),
      );
      toast('AI draft schedule applied — review & edit, then lock.', 'success');
    } catch {
      toast('AI schedule failed', 'error');
    } finally {
      setAiBusy(null);
    }
  };

  // ── AI: pre-lock review ────────────────────────────────────────────────────
  const runAIReview = async () => {
    if (!isAdmin) return;
    if (!openAIKey) { toast('Set your OpenAI API key in Settings first', 'error'); return; }
    setAiBusy('review');
    try {
      const res = await fetch('/api/production/ai-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: viewedDate,
          scheduledJobs: dayJobs.filter((j) => j.status !== 'held'),
          backlogJobs: backlog,
          machines: activeMachines,
          apiKey: openAIKey,
          model: productionSettings.model,
        }),
      });
      const data = await res.json();
      if (!res.ok) { toast(data.error || 'AI review failed', 'error'); return; }
      setAiReview(data);
      // Store on the day for the record.
      if (scheduleDay) setScheduleDay({ ...scheduleDay, aiSummary: data });
    } catch {
      toast('AI review failed', 'error');
    } finally {
      setAiBusy(null);
    }
  };

  // ── Create job from a concept ──────────────────────────────────────────────
  const createFromConcept = async (conceptId: string) => {
    const c = concepts.find((x) => x.id === conceptId);
    if (!c) return;
    // Map design complexity (1-5) → production complexity tier.
    const lc = c.specs.laserComplexity || 3;
    const complexity = lc <= 1 ? 'low' : lc === 2 ? 'medium' : lc === 3 ? 'medium' : lc === 4 ? 'high' : 'very_high';
    const created = await addProductionJob({
      title: c.name,
      sourceType: 'workflow',
      conceptId: c.id,
      designName: c.name,
      designImageUrl: c.coilImageUrl || c.combinedImageUrl || (c.stamps?.[0]?.imageUrl ?? ''),
      productType: c.collection || '',
      complexity: complexity as ProductionJob['complexity'],
      priority: c.priority,
      tags: c.tags,
      designNotes: c.manufacturingNotes || c.description || '',
      quantity: 1,
    });
    if (created) toast(`Added "${created.title}" to backlog`, 'success');
  };

  const openEdit = (j: ProductionJob) => { setModalJob(j); setShowModal(true); };
  const openCreate = () => { setModalJob(null); setShowModal(true); };

  // ── Render ─────────────────────────────────────────────────────────────────
  const dateLabel = (() => {
    if (viewedDate === todayKey()) return 'Today';
    if (viewedDate === addDays(todayKey(), 1)) return 'Tomorrow';
    const [y, m, d] = viewedDate.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  return (
    <div className="p-3 sm:p-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div className="min-w-0 flex items-center gap-3">
          <div>
            <h2 className="text-xl font-semibold">Manufacturing</h2>
            <p className="text-xs text-muted">Daily laser production schedule · {activeMachines.length} machines</p>
          </div>
          <div className="inline-flex rounded-lg border border-border overflow-hidden">
            <button onClick={() => setView('board')} className={`px-3 py-1.5 text-sm ${view === 'board' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>Board</button>
            <button onClick={() => setView('calendar')} className={`px-3 py-1.5 text-sm border-l border-border ${view === 'calendar' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>Calendar</button>
            <button onClick={() => setView('reports')} className={`px-3 py-1.5 text-sm border-l border-border ${view === 'reports' ? 'bg-accent text-white' : 'text-muted hover:text-foreground'}`}>Reports</button>
          </div>
        </div>
        {view === 'board' && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setViewedDate(addDays(viewedDate, -1))} className="px-2 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">←</button>
          <button onClick={() => setViewedDate(todayKey())} className={`px-3 py-1.5 text-sm rounded-lg border ${viewedDate === todayKey() ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'}`}>Today</button>
          <button onClick={() => setViewedDate(addDays(todayKey(), 1))} className={`px-3 py-1.5 text-sm rounded-lg border ${viewedDate === addDays(todayKey(), 1) ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'}`}>Tomorrow</button>
          <input type="date" value={viewedDate} onChange={(e) => e.target.value && setViewedDate(e.target.value)} className="px-2 py-1.5 text-sm bg-background border border-border rounded-lg focus:outline-none focus:border-accent" />
          <button onClick={() => setViewedDate(addDays(viewedDate, 1))} className="px-2 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">→</button>
          <span className="text-sm font-medium ml-1">{dateLabel}</span>
          {locked && <span className="text-[11px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-medium">🔒 Locked</span>}
        </div>
        )}
      </div>

      {view === 'reports' && <ProductionReports />}

      {view === 'calendar' && (
        <ProductionCalendar onPickDay={(d) => { setViewedDate(d); setView('board'); }} />
      )}

      {view === 'board' && (
      <>
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <button onClick={openCreate} className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium">+ Manual Job</button>
        <button onClick={() => setShowWorkflowPicker(true)} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">+ From Design Studio {eligibleConcepts.length > 0 && <span className="ml-1 text-[10px] bg-accent/10 text-accent px-1.5 rounded-full">{eligibleConcepts.length}</span>}</button>
        {closed ? (
          <span className="flex items-center gap-2 px-3 py-1.5 text-sm bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg">
            ✓ Day closed{scheduleDay?.closedBy ? ` by ${scheduleDay.closedBy}` : ''}
            {isAdmin && (
              <button onClick={() => reopenDay(viewedDate)} className="text-[11px] underline hover:no-underline">Reopen</button>
            )}
          </span>
        ) : (
          <button onClick={() => setShowCloseout(true)} className="px-3 py-1.5 text-sm border border-foreground/30 rounded-lg hover:bg-surface-hover">✓ Close Out Day</button>
        )}
        {isAdmin && (
          <>
            <button onClick={generateAISchedule} disabled={aiBusy !== null} className="px-3 py-1.5 text-sm bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium disabled:opacity-50">
              {aiBusy === 'schedule' ? 'Planning…' : '✦ Generate AI Schedule'}
            </button>
            <button onClick={runAIReview} disabled={aiBusy !== null} className="px-3 py-1.5 text-sm border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-50 disabled:opacity-50">
              {aiBusy === 'review' ? 'Reviewing…' : '✦ AI Review'}
            </button>
            <button onClick={() => setShowSettings(true)} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-foreground" title="AI production settings">⚙ AI Settings</button>
            <button onClick={toggleLock} className={`px-3 py-1.5 text-sm rounded-lg font-medium ml-auto ${locked ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200' : 'bg-foreground text-background hover:opacity-90'}`}>
              {locked ? '🔓 Unlock Schedule' : '🔒 Lock Today’s Schedule'}
            </button>
          </>
        )}
      </div>

      {/* AI summary / review banners */}
      {aiSummary && (
        <div className="mb-3 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 text-sm text-purple-900 flex items-start gap-2">
          <span>✦</span><span className="flex-1">{aiSummary}</span>
          <button onClick={() => setAiSummary(null)} className="text-purple-400 hover:text-purple-700">×</button>
        </div>
      )}
      {aiReview && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-sm border ${aiReview.approved_to_lock ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          <div className="flex items-center justify-between">
            <span className="font-semibold">{aiReview.approved_to_lock ? '✓ AI: safe to lock' : '⚠ AI: review before locking'}</span>
            <button onClick={() => setAiReview(null)} className="opacity-60 hover:opacity-100">×</button>
          </div>
          {aiReview.issues.length > 0 && (
            <ul className="list-disc ml-5 mt-1 space-y-0.5 text-xs">{aiReview.issues.map((s, i) => <li key={i}>{s}</li>)}</ul>
          )}
          {aiReview.recommended_changes.length > 0 && (
            <div className="mt-1 text-xs"><span className="font-medium">Suggested:</span>
              <ul className="list-disc ml-5 space-y-0.5">{aiReview.recommended_changes.map((s, i) => <li key={i}>{s}</li>)}</ul>
            </div>
          )}
        </div>
      )}

      {closed && scheduleDay?.closeout && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-sm text-emerald-900">
          <div className="font-semibold mb-0.5">Day closed{scheduleDay.closedAt ? ` · ${new Date(scheduleDay.closedAt).toLocaleString()}` : ''}</div>
          <div className="text-xs"><span className="font-medium">Completed:</span> {scheduleDay.closeout.completedSummary}</div>
          {scheduleDay.closeout.unfinishedSummary && <div className="text-xs whitespace-pre-line mt-0.5"><span className="font-medium">Unfinished:</span> {scheduleDay.closeout.unfinishedSummary}</div>}
          {scheduleDay.closeout.notes && <div className="text-xs mt-0.5"><span className="font-medium">Notes:</span> {scheduleDay.closeout.notes}</div>}
        </div>
      )}

      {/* Daily summary dashboard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
        <Stat label="Scheduled" value={`${summary.scheduledPieces} pcs`} sub={`target ${summary.targetPieces}`} tone={summary.scheduledPieces < summary.targetPieces ? 'warn' : 'ok'} />
        <Stat label="Completed" value={`${summary.completedPieces} pcs`} sub={summary.behind ? 'behind' : 'on track'} tone={summary.behind ? 'warn' : 'ok'} />
        {activeMachines.map((m) => {
          const load = computeMachineLoad(m, dayJobs);
          const done = completed.filter((j) => j.machineId === m.id).reduce((s, j) => s + (j.quantityCompleted || j.quantity), 0);
          return <Stat key={m.id} label={m.name.replace('Laser Machine', 'M')} value={`${load.utilizationPct}%`} sub={`${done}/${m.dailyPieceTarget} done`} tone={load.overloaded ? 'error' : load.idle ? 'warn' : 'ok'} />;
        })}
        <Stat label="Est / Actual" value={fmtMinutes(summary.estMinutes)} sub={`act ${fmtMinutes(summary.actualMinutes)}`} />
        <Stat label="Revenue" value={`$${Math.round(summary.revenueCompleted)}`} sub={`of $${Math.round(summary.revenueScheduled)}`} />
        <Stat label="Rework" value={`${summary.reworkCount}`} sub={`${summary.unfinished} unfinished`} tone={summary.reworkCount > 0 ? 'warn' : 'ok'} />
      </div>

      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="mb-4 space-y-1">
          {warnings.slice(0, 6).map((w, i) => (
            <div key={i} className={`text-xs px-3 py-1.5 rounded-lg border ${w.level === 'error' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
              {w.level === 'error' ? '⛔' : '⚠'} {w.message}
            </div>
          ))}
        </div>
      )}

      {/* 7-day capacity forecast */}
      <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
        {forecast.map((f) => {
          const hrs = (f.minutes / 60).toFixed(1);
          const cap = (f.capacity / 60).toFixed(0);
          const isView = f.date === viewedDate;
          return (
            <button key={f.date} onClick={() => setViewedDate(f.date)} className={`shrink-0 text-left px-2.5 py-1.5 rounded-lg border text-[11px] ${isView ? 'border-accent bg-accent/5' : 'border-border hover:border-foreground'} ${f.overBy > 0 ? 'ring-1 ring-red-300' : ''}`}>
              <div className="font-medium">{f.date === todayKey() ? 'Today' : (() => { const [y, m, d] = f.date.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }); })()}</div>
              <div className="text-muted">{f.pieces} pcs · {hrs}/{cap}h</div>
              {f.overBy > 0 && <div className="text-red-600">over {fmtMinutes(f.overBy)}</div>}
            </button>
          );
        })}
      </div>

      {/* Board */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 420px)' }}>
          <Column droppableId="backlog" title="Backlog" count={backlog.length} accent="border-t-slate-400">
            {backlog.map((j, i) => (
              <JobCard key={j.id} job={j} index={i} machines={machines} locked={locked} isAdmin={isAdmin}
                onEdit={openEdit} onDelete={(id) => setDeleteId(id)} onStart={startJob} onPause={pauseJob} onComplete={completeJob} onHold={holdJob} onRework={reworkJob} showWhy />
            ))}
          </Column>

          {activeMachines.map((m) => (
            <Column key={m.id} droppableId={m.id} title={m.name} count={jobsByMachine(m.id).length} accent="border-t-accent"
              subtitle={`${computeMachineLoad(m, dayJobs).utilizationPct}% · ${fmtMinutes(computeMachineLoad(m, dayJobs).minutes)}`}>
              {jobsByMachine(m.id).map((j, i) => (
                <JobCard key={j.id} job={j} index={i} machines={machines} locked={locked} isAdmin={isAdmin}
                  onEdit={openEdit} onDelete={(id) => setDeleteId(id)} onStart={startJob} onPause={pauseJob} onComplete={completeJob} onHold={holdJob} onRework={reworkJob} />
              ))}
            </Column>
          ))}

          <Column droppableId="held" title="Held / Problem" count={held.length} accent="border-t-red-400">
            {held.map((j, i) => (
              <JobCard key={j.id} job={j} index={i} machines={machines} locked={locked} isAdmin={isAdmin}
                onEdit={openEdit} onDelete={(id) => setDeleteId(id)} onStart={startJob} onPause={pauseJob} onComplete={completeJob} onHold={holdJob} onRework={reworkJob} />
            ))}
          </Column>

          <Column droppableId="completed" title="Completed" count={completed.length} accent="border-t-emerald-400">
            {completed.map((j, i) => (
              <JobCard key={j.id} job={j} index={i} machines={machines} locked={locked} isAdmin={isAdmin} compact
                onEdit={openEdit} onDelete={(id) => setDeleteId(id)} onStart={startJob} onPause={pauseJob} onComplete={completeJob} onHold={holdJob} onRework={reworkJob} />
            ))}
          </Column>
        </div>
      </DragDropContext>
      </>
      )}

      {showModal && (
        <ProductionJobModal job={modalJob || undefined} onClose={() => { setShowModal(false); setModalJob(null); }} />
      )}

      {showSettings && <ProductionSettingsModal onClose={() => setShowSettings(false)} />}

      {showCloseout && (
        <ProductionCloseoutModal
          date={viewedDate}
          completedPieces={summary.completedPieces}
          targetPieces={summary.targetPieces}
          unfinished={dayJobs.filter((j) => !['completed', 'held'].includes(j.status))}
          onClose={() => setShowCloseout(false)}
        />
      )}

      {showWorkflowPicker && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setShowWorkflowPicker(false)}>
          <div className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
              <h3 className="font-semibold">Add from Design Studio</h3>
              <button onClick={() => setShowWorkflowPicker(false)} className="text-muted hover:text-foreground text-lg">×</button>
            </div>
            <div className="p-4 space-y-2">
              {eligibleConcepts.length === 0 && <p className="text-sm text-muted text-center py-6">No approved / ready-for-manufacturing concepts available.</p>}
              {eligibleConcepts.map((c) => (
                <button key={c.id} onClick={() => { createFromConcept(c.id); }} className="w-full flex items-center gap-3 p-2 rounded-lg border border-border hover:border-accent text-left">
                  <div className="w-10 h-10 rounded bg-background border border-border overflow-hidden shrink-0">
                    {(c.coilImageUrl || c.stamps?.[0]?.imageUrl) && <img src={c.coilImageUrl || c.stamps?.[0]?.imageUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[10px] text-muted">{c.status.replace(/_/g, ' ')} · complexity {c.specs.laserComplexity}</div>
                  </div>
                  <span className="text-xs text-accent">+ Add</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title="Delete production job"
        message="This permanently removes the job and its logs."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => { if (deleteId) deleteProductionJob(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────
function Stat({ label, value, sub, tone = 'neutral' }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'error' | 'neutral' }) {
  const toneCls = tone === 'error' ? 'border-red-200 bg-red-50' : tone === 'warn' ? 'border-amber-200 bg-amber-50' : tone === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-surface';
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted truncate">{label}</div>
      <div className="text-base font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted truncate">{sub}</div>}
    </div>
  );
}

// ── Column ──────────────────────────────────────────────────────────────────
function Column({ droppableId, title, count, subtitle, accent, children }: {
  droppableId: string; title: string; count: number; subtitle?: string; accent: string; children: React.ReactNode;
}) {
  return (
    <div className={`shrink-0 w-72 bg-surface border border-border border-t-2 ${accent} rounded-lg flex flex-col overflow-hidden`}>
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          {subtitle && <p className="text-[10px] text-muted">{subtitle}</p>}
        </div>
        <span className="text-xs text-muted bg-border/50 px-1.5 py-0.5 rounded-full shrink-0">{count}</span>
      </div>
      <Droppable droppableId={droppableId}>
        {(provided, snapshot) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className={`flex-1 p-2 space-y-2 overflow-y-auto min-h-[120px] transition-colors ${snapshot.isDraggingOver ? 'bg-accent/5' : ''}`}>
            {children}
            {provided.placeholder}
            {count === 0 && !snapshot.isDraggingOver && (
              <div className="text-center text-[11px] text-muted py-8 opacity-50">Drop jobs here</div>
            )}
          </div>
        )}
      </Droppable>
    </div>
  );
}

// ── Job card ────────────────────────────────────────────────────────────────
function JobCard({ job, index, machines, locked, isAdmin, compact, onEdit, onDelete, onStart, onPause, onComplete, onHold, onRework, showWhy }: {
  job: ProductionJob; index: number; machines: Machine[]; locked: boolean; isAdmin: boolean; compact?: boolean; showWhy?: boolean;
  onEdit: (j: ProductionJob) => void; onDelete: (id: string) => void;
  onStart: (j: ProductionJob) => void; onPause: (j: ProductionJob) => void; onComplete: (j: ProductionJob) => void;
  onHold: (j: ProductionJob) => void; onRework: (j: ProductionJob) => void;
}) {
  const dragDisabled = locked && !isAdmin;
  const sla = slaStatus(job.shipByDate);
  const dueIn = daysUntil(job.dueDate);
  const why = jobBlockedState(job);

  return (
    <Draggable draggableId={job.id} index={index} isDragDisabled={dragDisabled}>
      {(provided, snapshot) => (
        <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
          className={`bg-background border border-border rounded-lg p-2.5 text-left ${snapshot.isDragging ? 'opacity-90 rotate-1 shadow-lg' : ''}`}>
          <div className="flex items-start gap-2">
            <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[job.priority] || 'bg-border'}`} title={`Priority: ${job.priority}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <button onClick={() => onEdit(job)} className="text-sm font-medium truncate hover:text-accent text-left flex-1" title={job.title}>{job.title}</button>
                {job.rush && <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold shrink-0">RUSH</span>}
              </div>
              <div className="text-[10px] text-muted truncate">
                {job.productType || '—'}{job.quantity > 1 ? ` ×${job.quantity}` : ''}{job.designName ? ` · ${job.designName}` : ''}
              </div>
            </div>
          </div>

          {!compact && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              <span className={`text-[9px] border px-1 rounded ${COMPLEXITY_BADGE[job.complexity] || ''}`}>{COMPLEXITY_LABELS[job.complexity]}</span>
              <span className="text-[9px] text-muted border border-border px-1 rounded">{fmtMinutes(jobTotalMinutes(job))}</span>
              {job.revenueValue > 0 && <span className="text-[9px] text-emerald-700 border border-emerald-200 px-1 rounded">${job.revenueValue}</span>}
              {sla !== 'none' && <span className={`text-[9px] px-1 rounded border ${sla === 'red' ? 'bg-red-50 text-red-700 border-red-200' : sla === 'yellow' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>ship {sla}</span>}
              {dueIn !== null && dueIn <= 1 && <span className="text-[9px] bg-red-50 text-red-700 border border-red-200 px-1 rounded">{dueIn < 0 ? `${-dueIn}d late` : dueIn === 0 ? 'due today' : 'due tmrw'}</span>}
              {job.aiReasoning && <span className="text-[9px] text-purple-700" title={job.aiReasoning}>✦</span>}
            </div>
          )}

          {showWhy && (
            <div className={`mt-1.5 text-[9px] px-1.5 py-0.5 rounded inline-block ${why.state === 'waiting_inventory' ? 'bg-red-50 text-red-700' : why.state === 'waiting_design' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-muted'}`}>
              {why.label}
            </div>
          )}

          {!compact && (
            <div className="flex flex-wrap gap-1 mt-2">
              {(job.status === 'scheduled' || job.status === 'paused' || job.status === 'rework') && (
                <ActionBtn onClick={() => onStart(job)} cls="bg-emerald-600 text-white">{job.status === 'paused' ? 'Resume' : 'Start'}</ActionBtn>
              )}
              {job.status === 'in_progress' && (
                <>
                  <ActionBtn onClick={() => onPause(job)} cls="bg-amber-500 text-white">Pause</ActionBtn>
                  <ActionBtn onClick={() => onComplete(job)} cls="bg-emerald-600 text-white">Complete</ActionBtn>
                </>
              )}
              {(job.status === 'scheduled' || job.status === 'in_progress' || job.status === 'paused') && (
                <>
                  <ActionBtn onClick={() => onHold(job)} cls="border border-border text-muted">Hold</ActionBtn>
                  <ActionBtn onClick={() => onRework(job)} cls="border border-border text-muted">Rework</ActionBtn>
                </>
              )}
              {job.status === 'held' && <ActionBtn onClick={() => onStart(job)} cls="bg-emerald-600 text-white">Resume</ActionBtn>}
            </div>
          )}

          {compact && job.actualTotalMinutes != null && (
            <div className="mt-1 text-[10px] text-muted">
              {job.quantityCompleted || job.quantity} done · actual {fmtMinutes(job.actualTotalMinutes)}
              {job.estimatedTotalMinutes > 0 && (() => {
                const v = (job.actualTotalMinutes || 0) - job.estimatedTotalMinutes;
                return <span className={v > 0 ? 'text-red-600' : 'text-emerald-600'}> ({v > 0 ? '+' : ''}{v}m vs est)</span>;
              })()}
            </div>
          )}

          <div className="mt-1.5 flex items-center justify-between">
            <span className="text-[9px] text-muted">{PRODUCTION_STATUS_LABELS[job.status]}</span>
            {isAdmin && <button onClick={() => onDelete(job.id)} className="text-[9px] text-muted hover:text-red-600">Delete</button>}
          </div>
        </div>
      )}
    </Draggable>
  );
}

function ActionBtn({ onClick, cls, children }: { onClick: () => void; cls: string; children: React.ReactNode }) {
  return <button onClick={onClick} className={`text-[10px] px-2 py-1 rounded font-medium ${cls}`}>{children}</button>;
}
