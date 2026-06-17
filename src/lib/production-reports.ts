import { ProductionJob, Machine } from './types';
import { jobTotalMinutes, daysUntil, addDays, todayKey, toDateKey } from './production';

/**
 * Production reporting — pure analytics over the job set. Answers the core
 * question: "did we make what we were supposed to make?" Everything is
 * derived from production_jobs already in the store (no extra API).
 */

export interface PerMachineReport {
  machineId: string;
  name: string;
  completedPieces: number;
  completedJobs: number;
  actualMinutes: number;
  estMinutes: number;
  utilizationPct: number;   // actual run time / available time over the range
}

export interface PerOperatorReport {
  operator: string;
  completedPieces: number;
  completedJobs: number;
  actualMinutes: number;
  avgDelayMinutes: number;  // avg(actual - est) for that operator
}

export interface ProductionReport {
  fromKey: string;
  toKey: string;
  days: number;
  piecesScheduled: number;
  piecesCompleted: number;
  completionPct: number;
  jobsCompleted: number;
  estMinutes: number;
  actualMinutes: number;
  avgEstMinutes: number;
  avgActualMinutes: number;
  avgDelayMinutes: number;     // + = slower than estimated
  onTimeJobs: number;
  dueDatedCompleted: number;
  onTimePct: number;
  reworkCount: number;
  reworkRate: number;          // rework / completed
  scrapCount: number;
  scrapRate: number;           // scrap / pieces completed
  heldCount: number;
  revenueScheduled: number;
  revenueCompleted: number;
  perMachine: PerMachineReport[];
  perOperator: PerOperatorReport[];
}

/** Inclusive date-range membership by scheduledDate. */
function inRange(dateKey: string | undefined, fromKey: string, toKey: string): boolean {
  if (!dateKey) return false;
  return dateKey >= fromKey && dateKey <= toKey;
}

function dayCount(fromKey: string, toKey: string): number {
  const d = daysUntil(toKey, fromKey);
  return d === null ? 1 : Math.max(1, d + 1);
}

export function computeProductionReport(
  jobs: ProductionJob[],
  machines: Machine[],
  fromKey: string,
  toKey: string,
): ProductionReport {
  const range = jobs.filter((j) => inRange(j.scheduledDate, fromKey, toKey));
  const active = range.filter((j) => j.status !== 'held');
  const completed = range.filter((j) => j.status === 'completed');
  const days = dayCount(fromKey, toKey);

  const piecesScheduled = active.reduce((s, j) => s + Math.max(1, j.quantity || 1), 0);
  const piecesCompleted = completed.reduce((s, j) => s + (j.quantityCompleted || j.quantity || 0), 0);
  const estMinutes = active.reduce((s, j) => s + jobTotalMinutes(j), 0);
  const actualMinutes = completed.reduce((s, j) => s + (j.actualTotalMinutes || 0), 0);

  const delays = completed
    .filter((j) => j.actualTotalMinutes != null && j.estimatedTotalMinutes > 0)
    .map((j) => (j.actualTotalMinutes || 0) - j.estimatedTotalMinutes);
  const avgDelay = delays.length ? Math.round(delays.reduce((s, d) => s + d, 0) / delays.length) : 0;

  // On-time: completed by its due date (compare actualEndTime's day to dueDate).
  const dueDated = completed.filter((j) => j.dueDate);
  const onTime = dueDated.filter((j) => {
    if (!j.actualEndTime) return false;
    const endKey = toDateKey(new Date(j.actualEndTime));
    return endKey <= (j.dueDate as string);
  });

  const reworkCount = range.filter((j) => j.status === 'rework' || !!j.reworkReason).length;
  const scrapCount = range.reduce((s, j) => s + (j.scrapCount || 0) + (j.quantityFailed || 0), 0);
  const heldCount = range.filter((j) => j.status === 'held').length;

  // Per-machine.
  const perMachine: PerMachineReport[] = machines
    .filter((m) => m.active)
    .map((m) => {
      const mineDone = completed.filter((j) => j.machineId === m.id);
      const actual = mineDone.reduce((s, j) => s + (j.actualTotalMinutes || 0), 0);
      const est = active.filter((j) => j.machineId === m.id).reduce((s, j) => s + jobTotalMinutes(j), 0);
      const available = days * (m.dailyHours || 8) * 60;
      return {
        machineId: m.id,
        name: m.name,
        completedPieces: mineDone.reduce((s, j) => s + (j.quantityCompleted || j.quantity || 0), 0),
        completedJobs: mineDone.length,
        actualMinutes: actual,
        estMinutes: est,
        utilizationPct: available > 0 ? Math.round((actual / available) * 100) : 0,
      };
    });

  // Per-operator (completed jobs that recorded an operator name).
  const opMap = new Map<string, PerOperatorReport>();
  for (const j of completed) {
    const op = j.operatorName?.trim() || 'Unassigned';
    const cur = opMap.get(op) || { operator: op, completedPieces: 0, completedJobs: 0, actualMinutes: 0, avgDelayMinutes: 0 };
    cur.completedPieces += j.quantityCompleted || j.quantity || 0;
    cur.completedJobs += 1;
    cur.actualMinutes += j.actualTotalMinutes || 0;
    opMap.set(op, cur);
  }
  // Second pass for avg delay per operator.
  for (const [op, rep] of opMap) {
    const ds = completed
      .filter((j) => (j.operatorName?.trim() || 'Unassigned') === op && j.actualTotalMinutes != null && j.estimatedTotalMinutes > 0)
      .map((j) => (j.actualTotalMinutes || 0) - j.estimatedTotalMinutes);
    rep.avgDelayMinutes = ds.length ? Math.round(ds.reduce((s, d) => s + d, 0) / ds.length) : 0;
  }

  return {
    fromKey, toKey, days,
    piecesScheduled,
    piecesCompleted,
    completionPct: piecesScheduled > 0 ? Math.round((piecesCompleted / piecesScheduled) * 100) : 0,
    jobsCompleted: completed.length,
    estMinutes,
    actualMinutes,
    avgEstMinutes: completed.length ? Math.round(estMinutes / Math.max(1, active.length)) : 0,
    avgActualMinutes: completed.length ? Math.round(actualMinutes / completed.length) : 0,
    avgDelayMinutes: avgDelay,
    onTimeJobs: onTime.length,
    dueDatedCompleted: dueDated.length,
    onTimePct: dueDated.length ? Math.round((onTime.length / dueDated.length) * 100) : 0,
    reworkCount,
    reworkRate: completed.length ? Math.round((reworkCount / completed.length) * 100) : 0,
    scrapCount,
    scrapRate: piecesCompleted > 0 ? Math.round((scrapCount / piecesCompleted) * 100) : 0,
    heldCount,
    revenueScheduled: active.reduce((s, j) => s + (j.revenueValue || 0), 0),
    revenueCompleted: completed.reduce((s, j) => s + (j.revenueValue || 0), 0),
    perMachine,
    perOperator: Array.from(opMap.values()).sort((a, b) => b.completedPieces - a.completedPieces),
  };
}

/** Range presets used by the reports UI. */
export function reportRange(preset: 'today' | 'week' | 'month'): { fromKey: string; toKey: string; label: string } {
  const today = todayKey();
  if (preset === 'today') return { fromKey: today, toKey: today, label: 'Today' };
  if (preset === 'week') return { fromKey: addDays(today, -6), toKey: today, label: 'Last 7 days' };
  // month-to-date
  const [y, m] = today.split('-');
  return { fromKey: `${y}-${m}-01`, toKey: today, label: 'This month' };
}
