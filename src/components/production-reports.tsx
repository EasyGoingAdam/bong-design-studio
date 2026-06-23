'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { fmtMinutes } from '@/lib/production';
import { computeProductionReport, reportRange } from '@/lib/production-reports';
import { ProductionDailyReport } from './production-daily-report';

/**
 * Production reporting / KPI dashboard. Answers: did we make what we were
 * supposed to make? Daily / weekly / monthly rollups + a detailed,
 * printable/exportable per-day report.
 */
export function ProductionReports() {
  const { productionJobs, machines } = useAppStore();
  const [preset, setPreset] = useState<'today' | 'week' | 'month' | 'daily'>('week');

  const range = useMemo(() => reportRange(preset === 'daily' ? 'today' : preset), [preset]);
  const report = useMemo(
    () => computeProductionReport(productionJobs, machines, range.fromKey, range.toKey),
    [productionJobs, machines, range],
  );

  const delayLabel = report.avgDelayMinutes > 0
    ? `+${report.avgDelayMinutes}m over est`
    : report.avgDelayMinutes < 0 ? `${report.avgDelayMinutes}m under est` : 'on estimate';

  const TABS: { id: typeof preset; label: string }[] = [
    { id: 'today', label: 'Today' },
    { id: 'week', label: 'Last 7 days' },
    { id: 'month', label: 'This month' },
    { id: 'daily', label: 'Daily report' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setPreset(t.id)}
            className={`px-3 py-1.5 text-sm rounded-lg border ${preset === t.id ? 'bg-accent text-white border-accent' : 'border-border hover:border-foreground'} ${t.id === 'daily' ? 'ml-1' : ''}`}
          >
            {t.label}
          </button>
        ))}
        {preset !== 'daily' && <span className="text-xs text-muted ml-1">{range.fromKey === range.toKey ? range.fromKey : `${range.fromKey} → ${range.toKey}`}</span>}
      </div>

      {preset === 'daily' && <ProductionDailyReport />}
      {preset !== 'daily' && (<>

      {/* Headline KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <KPI label="Completion" value={`${report.completionPct}%`} sub={`${report.piecesCompleted}/${report.piecesScheduled} pcs`} tone={report.completionPct >= 100 ? 'ok' : report.completionPct >= 70 ? 'neutral' : 'warn'} />
        <KPI label="Jobs done" value={`${report.jobsCompleted}`} sub={`${report.heldCount} held`} />
        <KPI label="On-time" value={report.dueDatedCompleted ? `${report.onTimePct}%` : '—'} sub={`${report.onTimeJobs}/${report.dueDatedCompleted} due-dated`} tone={report.onTimePct >= 90 ? 'ok' : report.dueDatedCompleted && report.onTimePct < 70 ? 'warn' : 'neutral'} />
        <KPI label="Est vs actual" value={fmtMinutes(report.actualMinutes)} sub={delayLabel} tone={report.avgDelayMinutes > 15 ? 'warn' : 'neutral'} />
        <KPI label="Rework" value={`${report.reworkRate}%`} sub={`${report.reworkCount} jobs`} tone={report.reworkRate > 10 ? 'warn' : 'ok'} />
        <KPI label="Revenue" value={`$${Math.round(report.revenueCompleted).toLocaleString()}`} sub={`of $${Math.round(report.revenueScheduled).toLocaleString()}`} />
      </div>

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPI label="Scrap / failed" value={`${report.scrapCount}`} sub={`${report.scrapRate}% of completed`} tone={report.scrapRate > 5 ? 'warn' : 'ok'} small />
        <KPI label="Avg job (actual)" value={fmtMinutes(report.avgActualMinutes)} small />
        <KPI label="Est hours" value={fmtMinutes(report.estMinutes)} small />
        <KPI label="Actual hours" value={fmtMinutes(report.actualMinutes)} small />
      </div>

      {/* Per-machine */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Output per machine</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {report.perMachine.map((m) => (
            <div key={m.machineId} className="border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{m.name}</span>
                <span className="text-xs text-muted">{m.completedPieces} pcs · {m.completedJobs} jobs</span>
              </div>
              <div className="mt-2 h-2 bg-background rounded-full overflow-hidden">
                <div className={`h-full ${m.utilizationPct > 100 ? 'bg-red-500' : 'bg-accent'}`} style={{ width: `${Math.min(100, m.utilizationPct)}%` }} />
              </div>
              <div className="mt-1 text-[11px] text-muted">{m.utilizationPct}% utilization · {fmtMinutes(m.actualMinutes)} run / {fmtMinutes(m.estMinutes)} est</div>
            </div>
          ))}
          {report.perMachine.length === 0 && <p className="text-sm text-muted">No active machines.</p>}
        </div>
      </div>

      {/* Per-operator */}
      <div>
        <h3 className="text-sm font-semibold mb-2">Output per operator</h3>
        {report.perOperator.length === 0 ? (
          <p className="text-sm text-muted">No completed jobs in this range.</p>
        ) : (
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-background text-muted text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Operator</th>
                  <th className="text-right px-3 py-2 font-medium">Pieces</th>
                  <th className="text-right px-3 py-2 font-medium">Jobs</th>
                  <th className="text-right px-3 py-2 font-medium">Run time</th>
                  <th className="text-right px-3 py-2 font-medium">Avg vs est</th>
                </tr>
              </thead>
              <tbody>
                {report.perOperator.map((o) => (
                  <tr key={o.operator} className="border-t border-border">
                    <td className="px-3 py-2">{o.operator}</td>
                    <td className="px-3 py-2 text-right">{o.completedPieces}</td>
                    <td className="px-3 py-2 text-right">{o.completedJobs}</td>
                    <td className="px-3 py-2 text-right">{fmtMinutes(o.actualMinutes)}</td>
                    <td className={`px-3 py-2 text-right ${o.avgDelayMinutes > 0 ? 'text-red-600' : o.avgDelayMinutes < 0 ? 'text-emerald-600' : 'text-muted'}`}>
                      {o.avgDelayMinutes > 0 ? '+' : ''}{o.avgDelayMinutes}m
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted">
        Reporting reads completed-job actuals. Operator stats populate once jobs are completed with an assigned operator;
        on-time % counts only jobs that had a due date.
      </p>
      </>)}
    </div>
  );
}

function KPI({ label, value, sub, tone = 'neutral', small }: {
  label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'neutral'; small?: boolean;
}) {
  const toneCls = tone === 'warn' ? 'border-amber-200 bg-amber-50' : tone === 'ok' ? 'border-emerald-200 bg-emerald-50' : 'border-border bg-surface';
  return (
    <div className={`rounded-lg border px-3 py-2 ${toneCls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted truncate">{label}</div>
      <div className={`font-semibold leading-tight ${small ? 'text-sm' : 'text-lg'}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted truncate">{sub}</div>}
    </div>
  );
}
