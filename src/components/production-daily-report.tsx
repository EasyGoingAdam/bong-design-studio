'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { fmtMinutes, jobTotalMinutes, todayKey } from '@/lib/production';
import { computeProductionReport } from '@/lib/production-reports';
import { ProductionJob, ProductionDailyReport as SnapshotMeta } from '@/lib/types';

/**
 * Detailed, printable, exportable report for a single production day.
 * Answers "what did we make today, how did it go" with a job-level table,
 * per-machine/operator rollups, the operator close-out, and a durable
 * snapshot so the record survives future edits to the jobs.
 */
export function ProductionDailyReport() {
  const { productionJobs, machines, scheduleDays, currentUser, saveDailyReport } = useAppStore();
  const { toast } = useToast();
  const [date, setDate] = useState(todayKey());
  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>([]);
  const [saving, setSaving] = useState(false);

  const refreshSnapshots = () => {
    fetch('/api/production/daily-report')
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setSnapshots(Array.isArray(d) ? d : []))
      .catch(() => {});
  };
  useEffect(() => { refreshSnapshots(); }, []);

  const dayJobs = useMemo(
    () => productionJobs.filter((j) => j.scheduledDate === date),
    [productionJobs, date],
  );
  const report = useMemo(
    () => computeProductionReport(productionJobs, machines, date, date),
    [productionJobs, machines, date],
  );
  const closeout = scheduleDays.find((d) => d.date === date)?.closeout;
  const machineName = (id?: string) => machines.find((m) => m.id === id)?.name || '—';
  const savedFor = snapshots.find((s) => s.date === date);

  const rows = useMemo(() => dayJobs.map((j) => {
    const est = jobTotalMinutes(j);
    const act = j.actualTotalMinutes ?? null;
    return {
      title: j.title,
      customer: j.customerName,
      product: j.productType,
      coil: j.coilSize || '',
      qty: j.quantity,
      done: j.quantityCompleted,
      status: j.status,
      est,
      actual: act,
      variance: act != null ? act - est : null,
      qc: j.qcResult || '',
      scrap: (j.scrapCount || 0) + (j.quantityFailed || 0),
      operator: j.operatorName,
      machine: machineName(j.machineId),
    };
  }), [dayJobs]); // eslint-disable-line react-hooks/exhaustive-deps

  const exportCsv = () => {
    const headers = ['Order/Title', 'Customer', 'Product', 'Coil', 'Qty', 'Completed', 'Status', 'Est min', 'Actual min', 'Variance min', 'QC', 'Scrap', 'Operator', 'Machine'];
    const esc = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    for (const r of rows) {
      lines.push([r.title, r.customer, r.product, r.coil, r.qty, r.done, r.status, r.est, r.actual ?? '', r.variance ?? '', r.qc, r.scrap, r.operator, r.machine].map(esc).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `production-${date}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const printReport = () => {
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { toast('Allow pop-ups to print the report', 'error'); return; }
    const cell = (v: unknown) => `<td style="padding:4px 8px;border:1px solid #ddd;font-size:12px">${String(v ?? '')}</td>`;
    const body = rows.map((r) => `<tr>${[r.title, r.customer, r.product, r.coil, r.qty, r.done, r.status, r.est, r.actual ?? '', r.variance ?? '', r.qc, r.scrap, r.operator, r.machine].map(cell).join('')}</tr>`).join('');
    w.document.write(`
      <html><head><title>Production Report ${date}</title></head>
      <body style="font-family:system-ui,sans-serif;padding:24px;color:#111">
        <h1 style="font-size:20px;margin:0 0 4px">Production Report — ${date}</h1>
        <p style="color:#666;font-size:13px;margin:0 0 16px">
          ${report.piecesCompleted}/${report.piecesScheduled} pcs · ${report.completionPct}% complete · on-time ${report.dueDatedCompleted ? report.onTimePct + '%' : '—'} ·
          rework ${report.reworkCount} · scrap ${report.scrapCount} · revenue $${Math.round(report.revenueCompleted)} of $${Math.round(report.revenueScheduled)} ·
          est ${fmtMinutes(report.estMinutes)} / actual ${fmtMinutes(report.actualMinutes)}
        </p>
        ${closeout ? `<div style="background:#f3faf5;border:1px solid #cde9d6;border-radius:8px;padding:10px;margin-bottom:16px;font-size:13px">
          <strong>Close-out</strong><br/>Completed: ${closeout.completedSummary || '—'}<br/>${closeout.unfinishedSummary ? 'Unfinished: ' + closeout.unfinishedSummary + '<br/>' : ''}${closeout.notes ? 'Notes: ' + closeout.notes : ''}
        </div>` : ''}
        <table style="border-collapse:collapse;width:100%">
          <thead><tr>${['Order/Title', 'Customer', 'Product', 'Coil', 'Qty', 'Done', 'Status', 'Est', 'Actual', 'Var', 'QC', 'Scrap', 'Operator', 'Machine'].map((h) => `<th style="padding:4px 8px;border:1px solid #ddd;background:#f5f5f5;font-size:11px;text-align:left">${h}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  const save = async () => {
    setSaving(true);
    const ok = await saveDailyReport(date, {
      date,
      summary: report,
      jobs: rows,
      closeout: closeout || null,
      savedBy: currentUser.name,
    });
    setSaving(false);
    if (ok) { toast(`Saved snapshot for ${date}`, 'success'); refreshSnapshots(); }
    else toast('Failed to save snapshot', 'error');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="bg-background border border-border rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
        <button onClick={() => setDate(todayKey())} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">Today</button>
        <div className="flex-1" />
        <button onClick={exportCsv} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">⤓ Export CSV</button>
        <button onClick={printReport} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">🖨 Print</button>
        <button onClick={save} disabled={saving} className="px-3 py-1.5 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-50">{saving ? 'Saving…' : savedFor ? 'Update snapshot' : 'Save snapshot'}</button>
      </div>

      {savedFor && <p className="text-[11px] text-muted">Snapshot saved {savedFor.updatedAt ? new Date(savedFor.updatedAt).toLocaleString() : ''}{savedFor.createdBy ? ` by ${savedFor.createdBy}` : ''}.</p>}

      {/* Headline numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        <Stat label="Completed" value={`${report.piecesCompleted}/${report.piecesScheduled}`} sub={`${report.completionPct}%`} />
        <Stat label="On-time" value={report.dueDatedCompleted ? `${report.onTimePct}%` : '—'} sub={`${report.onTimeJobs}/${report.dueDatedCompleted}`} />
        <Stat label="Est / Actual" value={fmtMinutes(report.actualMinutes)} sub={`est ${fmtMinutes(report.estMinutes)}`} />
        <Stat label="Rework" value={`${report.reworkCount}`} />
        <Stat label="Scrap" value={`${report.scrapCount}`} />
        <Stat label="Revenue" value={`$${Math.round(report.revenueCompleted)}`} sub={`of $${Math.round(report.revenueScheduled)}`} />
      </div>

      {/* Job table */}
      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-background text-muted">
            <tr>
              {['Order', 'Customer', 'Product', 'Coil', 'Qty', 'Status', 'Est', 'Actual', 'Var', 'QC', 'Scrap', 'Operator', 'Machine'].map((h) => (
                <th key={h} className="text-left px-2 py-1.5 font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={13} className="text-center text-muted py-8">No jobs scheduled for {date}.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-border">
                <td className="px-2 py-1.5 max-w-[180px] truncate" title={r.title}>{r.title}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.customer || '—'}</td>
                <td className="px-2 py-1.5 max-w-[120px] truncate">{r.product || '—'}</td>
                <td className="px-2 py-1.5">{r.coil ? r.coil.replace('_', ' ') : '—'}</td>
                <td className="px-2 py-1.5">{r.done}/{r.qty}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.status.replace('_', ' ')}</td>
                <td className="px-2 py-1.5">{fmtMinutes(r.est)}</td>
                <td className="px-2 py-1.5">{r.actual != null ? fmtMinutes(r.actual) : '—'}</td>
                <td className={`px-2 py-1.5 ${r.variance != null && r.variance > 0 ? 'text-red-600' : r.variance != null && r.variance < 0 ? 'text-emerald-600' : ''}`}>{r.variance != null ? `${r.variance > 0 ? '+' : ''}${r.variance}m` : '—'}</td>
                <td className={`px-2 py-1.5 ${r.qc === 'fail' ? 'text-red-600' : r.qc === 'pass' ? 'text-emerald-600' : ''}`}>{r.qc || '—'}</td>
                <td className="px-2 py-1.5">{r.scrap || 0}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.operator || '—'}</td>
                <td className="px-2 py-1.5 whitespace-nowrap">{r.machine}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {closeout && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-900">
          <div className="font-semibold mb-0.5">Operator close-out</div>
          <div className="text-xs"><span className="font-medium">Completed:</span> {closeout.completedSummary || '—'}</div>
          {closeout.unfinishedSummary && <div className="text-xs whitespace-pre-line mt-0.5"><span className="font-medium">Unfinished:</span> {closeout.unfinishedSummary}</div>}
          {closeout.notes && <div className="text-xs mt-0.5"><span className="font-medium">Notes:</span> {closeout.notes}</div>}
        </div>
      )}

      {snapshots.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1">Saved snapshots</div>
          <div className="flex flex-wrap gap-1.5">
            {snapshots.slice(0, 30).map((s) => (
              <button key={s.id} onClick={() => setDate(s.date)} className={`text-[11px] px-2 py-1 rounded border ${s.date === date ? 'border-accent bg-accent/5' : 'border-border hover:border-foreground'}`}>{s.date}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted truncate">{label}</div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {sub && <div className="text-[10px] text-muted truncate">{sub}</div>}
    </div>
  );
}
