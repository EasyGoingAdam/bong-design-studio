import {
  ProductionJob,
  ProductionComplexity,
  Machine,
  COMPLEXITY_BASE_MINUTES,
} from './types';

/**
 * Production planning helpers — pure functions, safe on client and server.
 *
 * The estimate model is deliberately simple and transparent so it works
 * WITHOUT the AI brain (manual fallback). The AI estimate endpoint can
 * overwrite the per-phase minutes with smarter numbers; everything here is
 * the deterministic baseline.
 */

/** Local YYYY-MM-DD for a Date (avoids UTC off-by-one from toISOString). */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

export function addDays(dateKey: string, n: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toDateKey(dt);
}

/**
 * Deterministic per-phase time estimate for a job.
 *
 *  - Run time scales with engraving complexity AND quantity (each piece
 *    runs, but repeat designs share setup).
 *  - Setup scales with setup complexity + alignment difficulty, and is
 *    discounted for repeat designs (fixturing already known).
 *  - Finish/inspection is a flat per-piece check.
 */
export function estimateJobMinutes(job: Partial<ProductionJob>): {
  setup: number;
  run: number;
  finish: number;
  total: number;
} {
  const complexity = (job.complexity || 'medium') as ProductionComplexity;
  const qty = Math.max(1, job.quantity || 1);

  // Run: base per piece × quantity.
  const perPieceRun = COMPLEXITY_BASE_MINUTES[complexity] ?? 60;
  const run = perPieceRun * qty;

  // Setup: one-time fixturing. Harder setup/alignment costs more; repeats
  // are cheaper because the jig is already dialed in.
  const setupBase: Record<string, number> = { low: 8, medium: 15, high: 30 };
  let setup =
    (setupBase[job.setupComplexity || 'medium'] ?? 15) +
    (setupBase[job.alignmentDifficulty || 'medium'] ?? 15) * 0.5;
  if (job.repeatDesign) setup = Math.round(setup * 0.5);
  setup = Math.round(setup);

  // Finish/inspection: per-piece check + pack.
  const finish = 5 * qty;

  return { setup, run, finish, total: setup + run + finish };
}

/** Total estimated minutes for a job, preferring stored estimate. */
export function jobTotalMinutes(job: ProductionJob): number {
  if (job.estimatedTotalMinutes && job.estimatedTotalMinutes > 0) {
    return job.estimatedTotalMinutes;
  }
  return estimateJobMinutes(job).total;
}

export function fmtMinutes(min: number): string {
  if (!min || min <= 0) return '0m';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Pieces (sum of quantities) across a set of jobs. */
export function totalPieces(jobs: ProductionJob[]): number {
  return jobs.reduce((s, j) => s + Math.max(1, j.quantity || 1), 0);
}

/** Per-machine load + utilization for a given day's scheduled jobs. */
export interface MachineLoad {
  machine: Machine;
  jobs: ProductionJob[];
  pieces: number;
  minutes: number;
  utilizationPct: number;
  overloaded: boolean;
  underTarget: boolean;
  idle: boolean;
}

export function computeMachineLoad(machine: Machine, jobs: ProductionJob[]): MachineLoad {
  const mine = jobs.filter((j) => j.machineId === machine.id);
  const pieces = totalPieces(mine);
  const minutes = mine.reduce((s, j) => s + jobTotalMinutes(j), 0);
  const availMin = Math.max(1, (machine.dailyHours || 8) * 60);
  const utilizationPct = Math.round((minutes / availMin) * 100);
  return {
    machine,
    jobs: mine,
    pieces,
    minutes,
    utilizationPct,
    overloaded: minutes > availMin,
    underTarget: pieces < (machine.dailyPieceTarget || 4),
    idle: mine.length === 0,
  };
}

/** Days until a date (negative = overdue). null when no date. */
export function daysUntil(dateKey: string | undefined, ref = todayKey()): number | null {
  if (!dateKey) return null;
  const [ry, rm, rd] = ref.split('-').map(Number);
  const [y, m, d] = dateKey.split('-').map(Number);
  const a = Date.UTC(ry, rm - 1, rd);
  const b = Date.UTC(y, m - 1, d);
  return Math.round((b - a) / 86400000);
}

/** SLA traffic-light for a ship-by date. */
export function slaStatus(shipBy: string | undefined): 'green' | 'yellow' | 'red' | 'none' {
  const d = daysUntil(shipBy);
  if (d === null) return 'none';
  if (d < 0) return 'red';
  if (d <= 1) return 'red';
  if (d <= 3) return 'yellow';
  return 'green';
}

/**
 * "Why isn't this scheduled?" — every production-ready job is always in
 * exactly one state. No black holes.
 */
export function jobBlockedState(job: ProductionJob):
  | { state: 'scheduled'; label: string }
  | { state: 'waiting_inventory'; label: string }
  | { state: 'waiting_design'; label: string }
  | { state: 'backlog'; label: string } {
  if (job.scheduledDate && job.machineId && job.status !== 'backlog') {
    return { state: 'scheduled', label: 'Scheduled' };
  }
  if (!job.inventoryAvailable) {
    return { state: 'waiting_inventory', label: 'Waiting for inventory' };
  }
  // Workflow jobs whose concept isn't approved yet are waiting on design.
  if (job.sourceType === 'workflow' && !job.designImageUrl && !job.conceptId) {
    return { state: 'waiting_design', label: 'Waiting for design' };
  }
  return { state: 'backlog', label: 'In backlog (unscheduled)' };
}

export interface ScheduleWarning {
  level: 'warn' | 'error';
  message: string;
}

/**
 * Daily schedule warnings. `dayJobs` = all jobs scheduled for the day
 * across machines; `backlogJobs` = everything still unscheduled.
 */
export function computeScheduleWarnings(
  machines: Machine[],
  dayJobs: ProductionJob[],
  backlogJobs: ProductionJob[],
  dayKey: string,
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];
  const activeMachines = machines.filter((m) => m.active);
  const targetPieces = activeMachines.reduce((s, m) => s + (m.dailyPieceTarget || 4), 0) || 8;
  const scheduledPieces = totalPieces(dayJobs.filter((j) => j.status !== 'held'));

  if (scheduledPieces < targetPieces) {
    warnings.push({
      level: 'warn',
      message: `Only ${scheduledPieces} of ${targetPieces} target pieces scheduled.`,
    });
  }

  for (const m of activeMachines) {
    const load = computeMachineLoad(m, dayJobs);
    if (load.overloaded) {
      warnings.push({
        level: 'error',
        message: `${m.name} is overloaded — ${fmtMinutes(load.minutes)} scheduled vs ${m.dailyHours}h available.`,
      });
    } else if (load.idle) {
      warnings.push({ level: 'warn', message: `${m.name} has no jobs scheduled.` });
    } else if (load.underTarget) {
      warnings.push({
        level: 'warn',
        message: `${m.name} has ${load.pieces} piece(s) — below its ${m.dailyPieceTarget}-piece target.`,
      });
    }
  }

  // High-priority / due-today / rush custom orders sitting in backlog.
  for (const j of backlogJobs) {
    if (j.priority === 'urgent' || j.rush) {
      warnings.push({ level: 'error', message: `Urgent/rush job unscheduled: "${j.title}".` });
    } else if (j.dueDate && daysUntil(j.dueDate, dayKey) !== null && daysUntil(j.dueDate, dayKey)! <= 0) {
      warnings.push({ level: 'error', message: `Due/overdue job unscheduled: "${j.title}".` });
    } else if (j.shipByDate && slaStatus(j.shipByDate) === 'red') {
      warnings.push({ level: 'error', message: `Ship-by at risk, unscheduled: "${j.title}".` });
    }
  }

  return warnings;
}
