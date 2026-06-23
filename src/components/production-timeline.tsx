'use client';

import { useMemo } from 'react';
import { ProductionJob, Machine, PRODUCTION_STATUS_LABELS } from '@/lib/types';
import { jobTotalMinutes, fmtMinutes, todayKey } from '@/lib/production';

/**
 * Intraday production timeline — each active machine is a lane across the
 * workday clock. Jobs are sequenced end-to-end from the workday start and
 * sized by estimated minutes, so the operator sees the actual running order,
 * clock times, and anything that overflows past end-of-day. Click a block
 * to edit the job. Read-only positioning (it reflects the column order).
 */

const parseHM = (hm: string): number => {
  const [h, m] = (hm || '09:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};
const fmtClock = (minOfDay: number): string => {
  let h = Math.floor(minOfDay / 60);
  const m = Math.round(minOfDay % 60);
  const ap = h >= 12 ? 'p' : 'a';
  h = h % 12; if (h === 0) h = 12;
  return `${h}:${m.toString().padStart(2, '0')}${ap}`;
};

const STATUS_BLOCK: Record<string, string> = {
  scheduled: 'bg-accent/15 border-accent/40 text-accent',
  in_progress: 'bg-emerald-100 border-emerald-400 text-emerald-900',
  paused: 'bg-amber-100 border-amber-400 text-amber-900',
  rework: 'bg-orange-100 border-orange-400 text-orange-900',
  completed: 'bg-slate-100 border-slate-300 text-slate-500',
};

export function ProductionTimeline({
  date, machines, jobs, workdayStart, workdayMinutes, onEdit,
}: {
  date: string;
  machines: Machine[];
  jobs: ProductionJob[];
  workdayStart: string;
  workdayMinutes: number;
  onEdit: (j: ProductionJob) => void;
}) {
  const startMin = parseHM(workdayStart);

  // Sequence each machine's jobs (column order: in-progress first, then
  // shortest estimate) and lay them end-to-end from the workday start.
  const lanes = useMemo(() => {
    return machines.map((m) => {
      const mine = jobs
        .filter((j) => j.machineId === m.id && j.status !== 'held')
        .sort((a, b) => {
          const rank = (j: ProductionJob) => (j.status === 'in_progress' ? 0 : j.status === 'completed' ? 2 : 1);
          if (rank(a) !== rank(b)) return rank(a) - rank(b);
          return jobTotalMinutes(a) - jobTotalMinutes(b);
        });
      let cursor = 0;
      const blocks = mine.map((j) => {
        const mins = Math.max(5, jobTotalMinutes(j));
        const block = { job: j, offset: cursor, mins };
        cursor += mins;
        return block;
      });
      return { machine: m, blocks, used: cursor };
    });
  }, [machines, jobs]);

  const maxUsed = lanes.reduce((mx, l) => Math.max(mx, l.used), 0);
  const span = Math.max(workdayMinutes, maxUsed, 60);
  const pct = (min: number) => `${(min / span) * 100}%`;

  // Hour ticks across the span.
  const ticks = useMemo(() => {
    const out: { min: number; label: string }[] = [];
    for (let m = 0; m <= span; m += 60) out.push({ min: m, label: fmtClock(startMin + m) });
    return out;
  }, [span, startMin]);

  // "Now" marker, only when viewing today within the window.
  const nowOffset = (() => {
    if (date !== todayKey()) return null;
    const now = new Date();
    const off = (now.getHours() * 60 + now.getMinutes()) - startMin;
    return off >= 0 && off <= span ? off : null;
  })();

  const anyJobs = lanes.some((l) => l.blocks.length > 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted">
          Workday {fmtClock(startMin)}–{fmtClock(startMin + workdayMinutes)} · sequenced from estimates. Blocks past end-of-day are flagged.
        </p>
      </div>

      {!anyJobs ? (
        <div className="text-center text-sm text-muted py-12 border border-dashed border-border rounded-lg">
          Nothing scheduled for this day. Assign jobs to a machine on the Board, or drag from the backlog.
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          {/* Time axis */}
          <div className="flex border-b border-border bg-background/50">
            <div className="w-28 shrink-0 px-2 py-1 text-[10px] text-muted">Machine</div>
            <div className="relative flex-1 h-6">
              {ticks.map((t) => (
                <div key={t.min} className="absolute top-0 bottom-0 border-l border-border/60" style={{ left: pct(t.min) }}>
                  <span className="text-[9px] text-muted ml-0.5">{t.label}</span>
                </div>
              ))}
              {/* end-of-workday marker */}
              {workdayMinutes < span && (
                <div className="absolute top-0 bottom-0 border-l-2 border-red-300" style={{ left: pct(workdayMinutes) }} title="End of workday" />
              )}
            </div>
          </div>

          {/* Lanes */}
          {lanes.map((lane) => {
            const over = lane.used > workdayMinutes;
            return (
              <div key={lane.machine.id} className="flex border-b border-border last:border-b-0">
                <div className="w-28 shrink-0 px-2 py-2 border-r border-border">
                  <div className="text-xs font-medium truncate">{lane.machine.name}</div>
                  <div className={`text-[9px] ${over ? 'text-red-600' : 'text-muted'}`}>{fmtMinutes(lane.used)}{over ? ' ⚠' : ''}</div>
                </div>
                <div className="relative flex-1 h-16 bg-background/30">
                  {/* hour gridlines */}
                  {ticks.map((t) => (
                    <div key={t.min} className="absolute top-0 bottom-0 border-l border-border/40" style={{ left: pct(t.min) }} />
                  ))}
                  {workdayMinutes < span && (
                    <div className="absolute top-0 bottom-0 bg-red-50/60" style={{ left: pct(workdayMinutes), right: 0 }} />
                  )}
                  {nowOffset != null && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10" style={{ left: pct(nowOffset) }} title="Now" />
                  )}
                  {lane.blocks.map((b) => {
                    const overflows = b.offset + b.mins > workdayMinutes;
                    return (
                      <button
                        key={b.job.id}
                        onClick={() => onEdit(b.job)}
                        title={`${b.job.title} · ${fmtClock(startMin + b.offset)}–${fmtClock(startMin + b.offset + b.mins)} · ${PRODUCTION_STATUS_LABELS[b.job.status]}`}
                        className={`absolute top-1 bottom-1 rounded border px-1.5 overflow-hidden text-left ${STATUS_BLOCK[b.job.status] || 'bg-surface border-border'} ${overflows ? 'ring-1 ring-red-400' : ''}`}
                        style={{ left: pct(b.offset), width: `calc(${pct(b.mins)} - 2px)` }}
                      >
                        <div className="text-[10px] font-medium truncate leading-tight">{b.job.title}</div>
                        <div className="text-[8px] opacity-80 truncate">{fmtClock(startMin + b.offset)}–{fmtClock(startMin + b.offset + b.mins)}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-[10px] text-muted">
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-100 border border-emerald-400 align-middle" /> In progress</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-accent/15 border border-accent/40 align-middle" /> Scheduled</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-400 align-middle" /> Paused</span>
        <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-slate-100 border border-slate-300 align-middle" /> Completed</span>
        <span><span className="inline-block w-2.5 h-2.5 ring-1 ring-red-400 rounded-sm align-middle" /> Past end-of-day</span>
      </div>
    </div>
  );
}
