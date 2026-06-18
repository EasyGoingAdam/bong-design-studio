'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';
import { ProductionJob } from '@/lib/types';
import { slaStatus, daysUntil } from '@/lib/production';

/**
 * Pulls the open ShipStation queue (pending + on_hold) and lets the operator
 * choose which orders to bring into the production backlog. Dedups against
 * shipments already imported.
 */
export function ProductionShipstationModal({ onClose }: { onClose: () => void }) {
  const { productionJobs, importProductionJobs } = useAppStore();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [drafts, setDrafts] = useState<Partial<ProductionJob>[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState('');
  const [importing, setImporting] = useState(false);

  const alreadyImported = useMemo(
    () => new Set(productionJobs.map((j) => j.shipstationOrderId).filter(Boolean)),
    [productionJobs],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/production/shipstation/import', { method: 'POST' });
        const data = await res.json();
        if (cancelled) return;
        if (data.configured === false) { setError('ShipStation token not configured.'); return; }
        if (data.error) { setError(data.error); return; }
        const incoming: Partial<ProductionJob>[] = (data.drafts || []).filter(
          (d: Partial<ProductionJob>) => !d.shipstationOrderId || !alreadyImported.has(d.shipstationOrderId),
        );
        setDrafts(incoming);
        // Default-select everything fresh.
        setSelected(new Set(incoming.map((d) => d.shipstationOrderId || '')));
      } catch {
        if (!cancelled) setError('Failed to reach ShipStation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = drafts.filter((d) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return [d.title, d.customerName, d.sku, (d.tags || []).join(' ')].join(' ').toLowerCase().includes(q);
  });

  const toggle = (id: string) =>
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const doImport = async () => {
    const chosen = drafts.filter((d) => selected.has(d.shipstationOrderId || ''));
    if (chosen.length === 0) { toast('Select at least one order', 'info'); return; }
    setImporting(true);
    const n = await importProductionJobs(chosen);
    toast(`Imported ${n} order${n === 1 ? '' : 's'} into the backlog`, 'success');
    setImporting(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div className="bg-surface border border-border rounded-xl w-full max-w-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Import from ShipStation</h2>
            <p className="text-xs text-muted">Open queue — pending &amp; on-hold orders</p>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-lg px-2">×</button>
        </div>

        <div className="px-5 py-3 border-b border-border flex items-center gap-2">
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter by order, customer, SKU, tag…" className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-accent" />
          <button onClick={() => setSelected(new Set(visible.map((d) => d.shipstationOrderId || '')))} className="text-xs px-2 py-1.5 border border-border rounded-lg hover:border-foreground">Select all</button>
          <button onClick={() => setSelected(new Set())} className="text-xs px-2 py-1.5 border border-border rounded-lg hover:border-foreground">None</button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 min-h-[200px]">
          {loading && <div className="text-center text-sm text-muted py-10">Loading ShipStation queue…</div>}
          {error && <div className="text-center text-sm text-red-600 py-10">{error}</div>}
          {!loading && !error && drafts.length === 0 && (
            <div className="text-center text-sm text-muted py-10">No new open orders to import — everything's already in the backlog.</div>
          )}
          {visible.map((d) => {
            const id = d.shipstationOrderId || '';
            const sel = selected.has(id);
            const sla = slaStatus(d.shipByDate);
            const ordered = daysUntil(d.orderDate);
            return (
              <button key={id} onClick={() => toggle(id)} className={`w-full flex items-center gap-3 p-2 rounded-lg border text-left transition-colors ${sel ? 'border-accent bg-accent/5' : 'border-border hover:border-foreground'}`}>
                <input type="checkbox" readOnly checked={sel} className="accent-accent shrink-0" />
                <div className="w-9 h-9 rounded bg-background border border-border overflow-hidden shrink-0">
                  {d.designImageUrl && <img src={d.designImageUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.title}</div>
                  <div className="text-[10px] text-muted truncate">
                    {d.customerName || '—'}{d.quantity ? ` · ${d.quantity} pc` : ''}{d.revenueValue ? ` · $${d.revenueValue}` : ''}
                    {ordered != null ? ` · ordered ${ordered <= 0 ? `${-ordered}d ago` : 'today'}` : ''}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {d.rush && <span className="text-[9px] bg-red-100 text-red-700 px-1 rounded font-bold">RUSH</span>}
                    {sla !== 'none' && <span className={`text-[9px] px-1 rounded border ${sla === 'red' ? 'bg-red-50 text-red-700 border-red-200' : sla === 'yellow' ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>ship {sla}</span>}
                    {(d.tags || []).filter((t) => t !== 'shipstation').slice(0, 3).map((t) => (
                      <span key={t} className="text-[9px] text-muted border border-border px-1 rounded">{t}</span>
                    ))}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between">
          <span className="text-xs text-muted">{selected.size} of {drafts.length} selected{drafts.length ? '' : ''}</span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-muted hover:text-foreground">Cancel</button>
            <button onClick={doImport} disabled={importing || selected.size === 0} className="px-4 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-lg font-medium disabled:opacity-50">
              {importing ? 'Importing…' : `Import ${selected.size} to backlog`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
