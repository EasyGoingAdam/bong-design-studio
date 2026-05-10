'use client';

import { useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Concept, KANBAN_COLUMNS, STATUS_LABELS } from '@/lib/types';

type Window = 30 | 90 | 180 | 365 | 0; // 0 = all-time

const WINDOW_LABELS: Record<Window, string> = {
  30: '30 days',
  90: '90 days',
  180: '6 months',
  365: '1 year',
  0: 'All time',
};

export function InsightsDashboard({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts } = useAppStore();
  const [window, setWindow] = useState<Window>(90);

  const cutoff = window === 0 ? 0 : Date.now() - window * 86_400_000;

  // Filter to the active window once.
  const inWindow = useMemo(
    () => concepts.filter((c) => new Date(c.createdAt).getTime() >= cutoff),
    [concepts, cutoff]
  );

  /* ───────────── Aggregations (single pass each) ───────────── */

  const stats = useMemo(() => {
    const total = inWindow.length;
    const byStatus: Record<string, number> = {};
    const tagCount: Record<string, number> = {};
    const collectionCount: Record<string, number> = {};
    const designerCount: Record<string, number> = {};
    const lifecycleCount: Record<string, number> = {};
    const monthCount: Record<string, number> = {}; // 'YYYY-MM' → n
    let aiGens = 0;
    let manufactured = 0;
    let urgent = 0;
    let withImages = 0;
    const ttManu: number[] = []; // days from createdAt → first 'manufactured' update

    for (const c of inWindow) {
      byStatus[c.status] = (byStatus[c.status] || 0) + 1;
      for (const t of c.tags) tagCount[t] = (tagCount[t] || 0) + 1;
      if (c.collection) collectionCount[c.collection] = (collectionCount[c.collection] || 0) + 1;
      if (c.designer) designerCount[c.designer] = (designerCount[c.designer] || 0) + 1;
      lifecycleCount[c.lifecycleType] = (lifecycleCount[c.lifecycleType] || 0) + 1;

      const month = c.createdAt.slice(0, 7); // YYYY-MM
      monthCount[month] = (monthCount[month] || 0) + 1;

      aiGens += c.aiGenerations.length;
      if (c.status === 'manufactured') {
        manufactured++;
        const created = new Date(c.createdAt).getTime();
        const updated = new Date(c.updatedAt).getTime();
        const days = Math.max(0, Math.round((updated - created) / 86_400_000));
        ttManu.push(days);
      }
      if (c.priority === 'urgent') urgent++;
      if (c.coilImageUrl || c.baseImageUrl) withImages++;
    }

    const avgTtManu = ttManu.length
      ? Math.round(ttManu.reduce((a, b) => a + b, 0) / ttManu.length)
      : null;

    return {
      total, byStatus, tagCount, collectionCount, designerCount,
      lifecycleCount, monthCount, aiGens, manufactured, urgent,
      withImages, avgTtManu,
    };
  }, [inWindow]);

  // Top N helpers
  const topTags = useMemo(
    () => Object.entries(stats.tagCount).sort((a, b) => b[1] - a[1]).slice(0, 12),
    [stats.tagCount]
  );
  const topCollections = useMemo(
    () => Object.entries(stats.collectionCount).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [stats.collectionCount]
  );
  const topDesigners = useMemo(
    () => Object.entries(stats.designerCount).sort((a, b) => b[1] - a[1]).slice(0, 8),
    [stats.designerCount]
  );

  // Monthly timeline — last 12 months ending now
  const monthlyTimeline = useMemo(() => {
    const out: { label: string; key: string; count: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      out.push({ label, key, count: stats.monthCount[key] || 0 });
    }
    return out;
  }, [stats.monthCount]);
  const maxMonthly = Math.max(1, ...monthlyTimeline.map((m) => m.count));

  // Top 5 concepts by AI generations (which ones soaked the most iteration)
  const mostIterated = useMemo(
    () => [...inWindow].sort((a, b) => b.aiGenerations.length - a.aiGenerations.length).slice(0, 5),
    [inWindow]
  );

  // Stuck concepts: in_review or approved but not touched in 14+ days
  const stuck = useMemo(() => {
    const cutoffDate = Date.now() - 14 * 86_400_000;
    return inWindow
      .filter(
        (c) =>
          ['in_review', 'approved'].includes(c.status) &&
          new Date(c.updatedAt).getTime() < cutoffDate
      )
      .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime())
      .slice(0, 8);
  }, [inWindow]);

  /* ───────────── Render ───────────── */

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-6">
        <div>
          <div className="eyebrow mb-1">Studio Analytics</div>
          <h2 className="display-sm">Insights</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Read-only view across your concepts — what's trending, who's busy, what's stuck.
          </p>
        </div>
        <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs shrink-0 self-start">
          {(Object.keys(WINDOW_LABELS) as unknown as Window[]).map((w, i) => (
            <button
              key={w}
              onClick={() => setWindow(Number(w) as Window)}
              className={`px-3 py-1.5 ${
                window === Number(w)
                  ? 'bg-foreground text-surface'
                  : 'bg-surface hover:bg-surface-hover'
              } ${i > 0 ? 'border-l border-border' : ''}`}
            >
              {WINDOW_LABELS[Number(w) as Window]}
            </button>
          ))}
        </div>
      </div>

      {/* Top stat row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <StatCard label="Concepts" value={stats.total} hint={`${stats.withImages} with images`} />
        <StatCard label="Manufactured" value={stats.manufactured}
          hint={stats.avgTtManu !== null ? `Avg ${stats.avgTtManu}d to ship` : 'No data yet'} />
        <StatCard label="AI generations" value={stats.aiGens}
          hint={stats.total > 0 ? `${(stats.aiGens / stats.total).toFixed(1)} per concept` : ''} />
        <StatCard label="Urgent" value={stats.urgent} accent={stats.urgent > 0} />
        <StatCard label="Active designers" value={Object.keys(stats.designerCount).length} />
      </div>

      {/* 2-column main */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Status distribution */}
        <Panel title="Pipeline distribution" eyebrow="By status">
          {KANBAN_COLUMNS.map((s) => {
            const n = stats.byStatus[s] || 0;
            const pct = stats.total > 0 ? (n / stats.total) * 100 : 0;
            return (
              <BarRow
                key={s}
                label={STATUS_LABELS[s]}
                value={n}
                pct={pct}
                stripCls={`col-strip-${s === 'in_review' ? 'review' : s === 'ready_for_manufacturing' ? 'ready' : s === 'manufactured' ? 'mfg' : s}`}
              />
            );
          })}
        </Panel>

        {/* Monthly timeline */}
        <Panel title="Concepts created" eyebrow="Last 12 months">
          <div className="flex items-end gap-1 h-32 mb-2">
            {monthlyTimeline.map((m) => {
              const heightPct = (m.count / maxMonthly) * 100;
              return (
                <div key={m.key} className="flex-1 flex flex-col items-center gap-1 group">
                  <div className="text-[10px] text-muted opacity-0 group-hover:opacity-100 transition-opacity tabular-nums">
                    {m.count}
                  </div>
                  <div
                    className="w-full bg-accent/20 hover:bg-accent/40 transition-colors rounded-t border-t-2 border-accent"
                    style={{ height: `${Math.max(heightPct, 2)}%`, minHeight: '4px' }}
                    title={`${m.label}: ${m.count}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="flex gap-1">
            {monthlyTimeline.map((m) => (
              <div key={m.key} className="flex-1 text-center text-[10px] text-muted">
                {m.label}
              </div>
            ))}
          </div>
        </Panel>

        {/* Top tags */}
        <Panel title="Top tags" eyebrow="Most-used motifs" empty={topTags.length === 0}>
          <div className="flex flex-wrap gap-1.5">
            {topTags.map(([tag, count]) => (
              <span
                key={tag}
                className="text-xs px-2.5 py-1 rounded-full bg-background border border-border"
                style={{ fontSize: `${Math.min(11 + count, 18)}px` }}
              >
                {tag} <span className="text-muted">·{count}</span>
              </span>
            ))}
          </div>
        </Panel>

        {/* Top collections */}
        <Panel title="Top collections" eyebrow="By concept count" empty={topCollections.length === 0}>
          {topCollections.map(([name, count]) => {
            const max = topCollections[0][1];
            return <BarRow key={name} label={name} value={count} pct={(count / max) * 100} />;
          })}
        </Panel>

        {/* Designers */}
        <Panel title="Designer activity" eyebrow="Concepts created in window" empty={topDesigners.length === 0}>
          {topDesigners.map(([name, count]) => {
            const max = topDesigners[0][1];
            return <BarRow key={name} label={name} value={count} pct={(count / max) * 100} />;
          })}
        </Panel>

        {/* Lifecycle */}
        <Panel title="Lifecycle mix" eyebrow="Evergreen vs limited">
          {Object.entries(stats.lifecycleCount).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
            const max = Math.max(...Object.values(stats.lifecycleCount));
            return <BarRow key={type} label={type.replace('_', ' ')} value={count} pct={(count / max) * 100} />;
          })}
          {Object.keys(stats.lifecycleCount).length === 0 && (
            <div className="text-xs text-muted py-4 text-center">No data in window.</div>
          )}
        </Panel>
      </div>

      {/* Stuck + Most-iterated, full-width */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Panel
          title="Stuck concepts"
          eyebrow="In review/approved · 14+ days idle"
          empty={stuck.length === 0}
          emptyMsg="Nothing's stuck. ✓"
        >
          <div className="space-y-1.5">
            {stuck.map((c) => {
              const daysIdle = Math.round((Date.now() - new Date(c.updatedAt).getTime()) / 86_400_000);
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenConcept(c.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-background hover:bg-surface-hover border border-border text-left transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-[11px] text-muted">{STATUS_LABELS[c.status]} · {c.designer || 'unassigned'}</div>
                  </div>
                  <div className="text-xs text-accent tabular-nums shrink-0">{daysIdle}d</div>
                </button>
              );
            })}
          </div>
        </Panel>

        <Panel
          title="Most iterated"
          eyebrow="Top 5 by AI generations"
          empty={mostIterated.length === 0 || mostIterated[0].aiGenerations.length === 0}
        >
          <div className="space-y-1.5">
            {mostIterated.filter((c) => c.aiGenerations.length > 0).map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenConcept(c.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-background hover:bg-surface-hover border border-border text-left transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-muted">{STATUS_LABELS[c.status]}</div>
                </div>
                <div className="text-xs tabular-nums shrink-0">
                  <span className="text-foreground font-medium">{c.aiGenerations.length}</span>
                  <span className="text-muted"> gens</span>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ───────────── Subcomponents ───────────── */

function StatCard({
  label, value, hint, accent,
}: { label: string; value: number | string; hint?: string; accent?: boolean }) {
  return (
    <div className={`bg-surface border rounded-lg p-4 ${accent ? 'border-accent' : 'border-border'}`}>
      <div className="eyebrow mb-1">{label}</div>
      <div className={`serif text-3xl font-medium tabular-nums ${accent ? 'text-accent' : ''}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted mt-1">{hint}</div>}
    </div>
  );
}

function Panel({
  title, eyebrow, children, empty, emptyMsg = 'No data in this window.',
}: {
  title: string; eyebrow?: string;
  children: React.ReactNode;
  empty?: boolean; emptyMsg?: string;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-5">
      <div className="mb-4">
        {eyebrow && <div className="eyebrow mb-1">{eyebrow}</div>}
        <h3 className="serif text-lg font-medium">{title}</h3>
      </div>
      {empty ? (
        <div className="text-xs text-muted py-6 text-center italic">{emptyMsg}</div>
      ) : (
        <div className="space-y-2">{children}</div>
      )}
    </div>
  );
}

function BarRow({
  label, value, pct, stripCls,
}: { label: string; value: number; pct: number; stripCls?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-32 text-xs truncate capitalize">{label}</div>
      <div className="flex-1 relative h-5 bg-background rounded overflow-hidden">
        <div
          className={`h-full transition-all ${stripCls || ''}`}
          style={{
            width: `${Math.max(pct, 2)}%`,
            background: stripCls
              ? undefined
              : 'linear-gradient(90deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, transparent))',
          }}
        />
      </div>
      <div className="w-10 text-right text-xs tabular-nums text-muted">{value}</div>
    </div>
  );
}
