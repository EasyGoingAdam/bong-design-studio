'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { toDateKey, todayKey, fmtMinutes, jobTotalMinutes } from '@/lib/production';

/**
 * Month calendar for future planning. Each cell shows the day's scheduled
 * load (pieces + hours vs capacity) and flags days that exceed capacity.
 * Click a day to jump the board to it.
 */
export function ProductionCalendar({ onPickDay }: { onPickDay: (date: string) => void }) {
  const { productionJobs, machines } = useAppStore();
  const today = todayKey();
  const [ym, setYm] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 }; // m is 0-indexed
  });

  const dailyCapacityMin = useMemo(
    () => machines.filter((m) => m.active).reduce((s, m) => s + (m.dailyHours || 8) * 60, 0) || 960,
    [machines],
  );

  // Per-day load map (scheduled, non-held jobs).
  const loadByDay = useMemo(() => {
    const map = new Map<string, { pieces: number; minutes: number }>();
    for (const j of productionJobs) {
      if (!j.scheduledDate || j.status === 'held') continue;
      const cur = map.get(j.scheduledDate) || { pieces: 0, minutes: 0 };
      cur.pieces += Math.max(1, j.quantity || 1);
      cur.minutes += jobTotalMinutes(j);
      map.set(j.scheduledDate, cur);
    }
    return map;
  }, [productionJobs]);

  // Build a 6-week grid starting from the Sunday on/before the 1st.
  const cells = useMemo(() => {
    const first = new Date(ym.y, ym.m, 1);
    const start = new Date(first);
    start.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return { key: toDateKey(d), day: d.getDate(), inMonth: d.getMonth() === ym.m };
    });
  }, [ym]);

  const monthLabel = new Date(ym.y, ym.m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const shiftMonth = (n: number) => setYm(({ y, m }) => {
    const d = new Date(y, m + n, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // Month totals.
  const monthStats = useMemo(() => {
    let pieces = 0, minutes = 0;
    for (const c of cells) {
      if (!c.inMonth) continue;
      const l = loadByDay.get(c.key);
      if (l) { pieces += l.pieces; minutes += l.minutes; }
    }
    return { pieces, minutes };
  }, [cells, loadByDay]);

  const unscheduledCount = productionJobs.filter((j) => !j.scheduledDate && j.status !== 'completed').length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="px-2 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">←</button>
          <span className="text-sm font-semibold w-40 text-center">{monthLabel}</span>
          <button onClick={() => shiftMonth(1)} className="px-2 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">→</button>
          <button onClick={() => { const [y, m] = today.split('-').map(Number); setYm({ y, m: m - 1 }); }} className="px-3 py-1.5 text-sm border border-border rounded-lg hover:border-foreground">This month</button>
        </div>
        <div className="text-xs text-muted">
          Month: <strong>{monthStats.pieces}</strong> pcs · {fmtMinutes(monthStats.minutes)} ·
          {' '}<strong>{unscheduledCount}</strong> unscheduled in backlog · capacity {fmtMinutes(dailyCapacityMin)}/day
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-[10px] uppercase tracking-wide text-muted text-center py-1">{d}</div>
        ))}
        {cells.map((c) => {
          const l = loadByDay.get(c.key);
          const over = l ? l.minutes > dailyCapacityMin : false;
          const pct = l ? Math.min(100, Math.round((l.minutes / dailyCapacityMin) * 100)) : 0;
          const isToday = c.key === today;
          return (
            <button
              key={c.key}
              onClick={() => onPickDay(c.key)}
              className={`min-h-[78px] text-left rounded-lg border p-1.5 transition-colors ${
                c.inMonth ? 'bg-surface hover:border-accent' : 'bg-background/40 opacity-50'
              } ${isToday ? 'border-accent ring-1 ring-accent/40' : 'border-border'} ${over ? 'ring-1 ring-red-300' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span className={`text-xs ${isToday ? 'font-bold text-accent' : 'text-muted'}`}>{c.day}</span>
                {l && l.pieces > 0 && <span className="text-[9px] text-muted">{l.pieces}pc</span>}
              </div>
              {l && l.minutes > 0 ? (
                <div className="mt-1">
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div className={`h-full ${over ? 'bg-red-500' : pct > 80 ? 'bg-amber-500' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <div className={`text-[9px] mt-0.5 ${over ? 'text-red-600' : 'text-muted'}`}>{fmtMinutes(l.minutes)}{over ? ' ⚠' : ''}</div>
                </div>
              ) : (
                c.inMonth && <div className="text-[9px] text-muted/50 mt-1">—</div>
              )}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted">
        Click a day to open its board. Bars show scheduled run-time vs daily machine capacity; red = over capacity.
        Move a job to another day by editing it (set its scheduled date) or dragging on the day board.
      </p>
    </div>
  );
}
