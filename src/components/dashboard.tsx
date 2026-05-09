'use client';

import { useAppStore } from '@/lib/store';
import { StatCard, StatusBadge, PriorityBadge } from './ui';
import { ConceptStatus } from '@/lib/types';
import { useMemo } from 'react';
import { formatDate } from '@/lib/utils';
import { computeReadiness } from '@/lib/readiness';

export function Dashboard({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts } = useAppStore();

  const stats = useMemo(() => {
    // Single-pass aggregation: one walk over `concepts` instead of seven
    // separate filter/reduce/map passes. Also calls computeReadiness ONCE
    // per non-archived concept (was being called twice before — once for
    // shipReady, once for avgReadiness).
    const counts: Record<string, number> = {
      ideation: 0, in_review: 0, approved: 0, ready_for_manufacturing: 0,
      manufactured: 0, archived: 0,
    };
    const collections: Record<string, number> = {};
    const approvalTimesMs: number[] = [];
    let manufacturedThisWeek = 0;
    let thisMonth = 0;
    let versionsTotal = 0;
    let liveCount = 0;
    let shipReady = 0;
    let readinessSum = 0;

    const now = Date.now();
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const monthStartMs = monthStart.getTime();
    const weekAgoMs = now - 7 * 24 * 60 * 60 * 1000;

    for (const c of concepts) {
      counts[c.status] = (counts[c.status] ?? 0) + 1;
      if (c.collection) collections[c.collection] = (collections[c.collection] ?? 0) + 1;
      versionsTotal += c.versions.length;

      const createdMs = new Date(c.createdAt).getTime();
      if (createdMs >= monthStartMs) thisMonth += 1;

      if (c.status === 'manufactured') {
        const mfgMs = c.manufacturingRecord?.dateManufactured
          ? new Date(c.manufacturingRecord.dateManufactured).getTime()
          : new Date(c.updatedAt).getTime();
        if (mfgMs >= weekAgoMs) manufacturedThisWeek += 1;
      }

      const approved = c.approvalLogs.find((a) => a.action === 'approved');
      if (approved) {
        approvalTimesMs.push(new Date(approved.createdAt).getTime() - createdMs);
      }

      if (c.status !== 'archived') {
        liveCount += 1;
        const r = computeReadiness(c);
        if (r.ready) shipReady += 1;
        readinessSum += r.percent;
      }
    }

    const topCollectionEntry = Object.entries(collections).sort((a, b) => b[1] - a[1])[0];
    const avgApprovalDays = approvalTimesMs.length > 0
      ? Math.round(approvalTimesMs.reduce((a, b) => a + b, 0) / approvalTimesMs.length / (1000 * 60 * 60 * 24))
      : 0;

    return {
      ideation: counts.ideation,
      inReview: counts.in_review,
      approved: counts.approved,
      readyForMfg: counts.ready_for_manufacturing,
      manufactured: counts.manufactured,
      thisMonth,
      manufacturedThisWeek,
      topCollection: topCollectionEntry ? `${topCollectionEntry[0]} (${topCollectionEntry[1]})` : 'None',
      avgApproval: avgApprovalDays > 0 ? `${avgApprovalDays} days` : 'N/A',
      avgVersions: concepts.length > 0 ? (versionsTotal / concepts.length).toFixed(1) : '0',
      shipReady,
      avgReadiness: liveCount > 0 ? Math.round(readinessSum / liveCount) : 0,
      liveCount,
    };
  }, [concepts]);

  // Production queue — concepts READY to move into production right now.
  // Sort urgent → high → medium → low within the ready bucket.
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  const productionQueue = useMemo(
    () =>
      concepts
        .filter((c) => c.status === 'ready_for_manufacturing')
        .sort((a, b) => {
          const pa = priorityOrder[a.priority] ?? 99;
          const pb = priorityOrder[b.priority] ?? 99;
          if (pa !== pb) return pa - pb;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [concepts]
  );

  // In review and approved — things that are about to enter the production queue
  const inReviewConcepts = useMemo(
    () => concepts.filter((c) => c.status === 'in_review').slice(0, 5),
    [concepts]
  );
  const approvedWaiting = useMemo(
    () => concepts.filter((c) => c.status === 'approved').slice(0, 5),
    [concepts]
  );

  const recentConcepts = useMemo(
    () => [...concepts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 6),
    [concepts]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <div className="eyebrow mb-1">Studio Overview</div>
        <h2 className="display-sm">Dashboard</h2>
        <p className="text-sm text-muted mt-1">What&apos;s ready to ship, and what&apos;s moving toward production.</p>
      </div>

      {/* PRODUCTION QUEUE — the hero module */}
      <div className="bg-gradient-to-br from-blue-50 to-accent/5 border-2 border-blue-200 rounded-xl overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 p-4 sm:p-5 border-b border-blue-200 bg-white/50">
          <div>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-4xl sm:text-5xl font-black text-blue-700 tabular-nums leading-none">
                {stats.readyForMfg}
              </span>
              <div>
                <h3 className="text-base font-semibold text-blue-900">Ready for Manufacturing</h3>
                <p className="text-xs text-blue-700/70">
                  {stats.readyForMfg === 0
                    ? 'Nothing waiting for production right now.'
                    : stats.readyForMfg === 1
                      ? '1 concept ready to ship to production.'
                      : `${stats.readyForMfg} concepts ready to ship to production.`}
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 sm:gap-6 md:shrink-0">
            <div className="text-left md:text-right">
              <div className="text-xs text-blue-700/70">Ship-ready concepts</div>
              <div className="text-xl sm:text-2xl font-bold text-green-700 tabular-nums">
                {stats.shipReady}<span className="text-xs text-blue-700/70">/{stats.liveCount}</span>
              </div>
              <div className="text-[10px] text-blue-700/70">avg {stats.avgReadiness}% complete</div>
            </div>
            <div className="text-left md:text-right">
              <div className="text-xs text-blue-700/70">Manufactured this week</div>
              <div className="text-xl sm:text-2xl font-bold text-blue-900 tabular-nums">
                {stats.manufacturedThisWeek}
              </div>
            </div>
          </div>
        </div>
        <div className="p-3">
          {productionQueue.length === 0 ? (
            <div className="text-center py-6 text-sm text-blue-700/60">
              No concepts in the production queue. Move approved designs to Ready for Manufacturing on the Workflow Board.
            </div>
          ) : (
            <div className="space-y-1.5">
              {productionQueue.slice(0, 8).map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenConcept(c.id)}
                  className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-white transition-colors text-left group"
                >
                  <div className="w-10 h-10 rounded bg-background placeholder-pattern border border-border shrink-0 overflow-hidden">
                    {c.coilImageUrl ? (
                      <img src={c.coilImageUrl} alt="" className="w-full h-full object-contain" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate group-hover:text-accent transition-colors">
                      {c.name}
                    </div>
                    <div className="text-xs text-muted truncate">
                      {c.collection || 'No collection'} · {c.designer}
                      {c.manufacturingRecord?.batchName ? ` · Batch ${c.manufacturingRecord.batchName}` : ''}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted">Ready {formatDate(c.updatedAt)}</span>
                    <PriorityBadge priority={c.priority} />
                  </div>
                </button>
              ))}
              {productionQueue.length > 8 && (
                <p className="text-xs text-muted text-center pt-2">
                  + {productionQueue.length - 8} more in queue
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* OPERATIONAL SUMMARY BAR */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Ideation" value={stats.ideation} sub="concepts" />
        <StatCard label="In Review" value={stats.inReview} sub="concepts" />
        <StatCard label="Approved" value={stats.approved} sub="waiting for prod" />
        <StatCard label="Ready for Mfg" value={stats.readyForMfg} sub="in production queue" />
        <StatCard label="Manufactured" value={stats.manufactured} sub="total shipped" />
      </div>

      {/* UPSTREAM QUEUES */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Approved (next up for production) */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">Approved — next up for production</h3>
            <span className="text-xs text-muted bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">
              {stats.approved}
            </span>
          </div>
          <div className="space-y-1.5">
            {approvedWaiting.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">Nothing approved and waiting.</p>
            ) : (
              approvedWaiting.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenConcept(c.id)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-border placeholder-pattern shrink-0 overflow-hidden">
                      {c.coilImageUrl && <img src={c.coilImageUrl} alt="" className="w-full h-full object-contain" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted">{c.designer}</div>
                    </div>
                  </div>
                  <PriorityBadge priority={c.priority} />
                </button>
              ))
            )}
          </div>
        </div>

        {/* In Review */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold">In Review</h3>
            <span className="text-xs text-muted bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
              {stats.inReview}
            </span>
          </div>
          <div className="space-y-1.5">
            {inReviewConcepts.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No concepts in review.</p>
            ) : (
              inReviewConcepts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenConcept(c.id)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-border placeholder-pattern shrink-0 overflow-hidden">
                      {c.coilImageUrl && <img src={c.coilImageUrl} alt="" className="w-full h-full object-contain" />}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted">{c.designer}</div>
                    </div>
                  </div>
                  <PriorityBadge priority={c.priority} />
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* RECENT ACTIVITY + TOP-LEVEL METRICS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-surface border border-border rounded-xl p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold mb-3">Recently Updated</h3>
          <div className="space-y-1.5">
            {recentConcepts.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenConcept(c.id)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-border placeholder-pattern shrink-0 overflow-hidden">
                    {c.coilImageUrl && <img src={c.coilImageUrl} alt="" className="w-full h-full object-contain" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted">{c.collection || 'No collection'}</div>
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <StatCard label="Created This Month" value={stats.thisMonth} />
          <StatCard label="Top Collection" value={stats.topCollection} />
          <StatCard label="Avg Approval Time" value={stats.avgApproval} />
          <StatCard label="Avg Versions" value={stats.avgVersions} sub="per concept" />
        </div>
      </div>

      {/* PIPELINE VISUALIZATION */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">Pipeline Flow</h3>
        <div className="flex items-center gap-2">
          {[
            { label: 'Ideation', count: stats.ideation, color: 'bg-purple-500' },
            { label: 'Review', count: stats.inReview, color: 'bg-yellow-500' },
            { label: 'Approved', count: stats.approved, color: 'bg-green-500' },
            { label: 'Ready', count: stats.readyForMfg, color: 'bg-blue-500' },
            { label: 'Made', count: stats.manufactured, color: 'bg-emerald-500' },
          ].map((stage) => {
            const total = concepts.length || 1;
            const pct = Math.max(5, (stage.count / total) * 100);
            return (
              <div key={stage.label} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full bg-background rounded-full h-8 overflow-hidden">
                  <div
                    className={`${stage.color} h-full rounded-full flex items-center justify-center transition-all duration-500`}
                    style={{ width: `${pct}%`, minWidth: '24px' }}
                  >
                    <span className="text-xs font-bold text-white">{stage.count}</span>
                  </div>
                </div>
                <span className="text-xs text-muted">{stage.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
