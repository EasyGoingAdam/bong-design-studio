'use client';

import { useAppStore } from '@/lib/store';
import { StatCard, StatusBadge, PriorityBadge } from './ui';
import { ConceptStatus } from '@/lib/types';
import { useMemo } from 'react';

export function Dashboard({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { concepts } = useAppStore();

  const stats = useMemo(() => {
    const byStatus = (s: ConceptStatus) => concepts.filter((c) => c.status === s).length;
    const thisMonth = concepts.filter((c) => {
      const d = new Date(c.createdAt);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length;

    const collections = concepts.reduce((acc, c) => {
      if (c.collection) acc[c.collection] = (acc[c.collection] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const topCollection = Object.entries(collections).sort((a, b) => b[1] - a[1])[0];

    const approvalTimes = concepts
      .filter((c) => c.approvalLogs.length > 0)
      .map((c) => {
        const approved = c.approvalLogs.find((a) => a.action === 'approved');
        if (!approved) return null;
        return (new Date(approved.createdAt).getTime() - new Date(c.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      })
      .filter((t): t is number => t !== null);
    const avgApproval = approvalTimes.length > 0
      ? Math.round(approvalTimes.reduce((a, b) => a + b, 0) / approvalTimes.length)
      : 0;

    return {
      ideation: byStatus('ideation'),
      inReview: byStatus('in_review'),
      approved: byStatus('approved'),
      readyForMfg: byStatus('ready_for_manufacturing'),
      manufactured: byStatus('manufactured'),
      thisMonth,
      topCollection: topCollection ? `${topCollection[0]} (${topCollection[1]})` : 'None',
      avgApproval: avgApproval > 0 ? `${avgApproval} days` : 'N/A',
      avgVersions: concepts.length > 0
        ? (concepts.reduce((a, c) => a + c.versions.length, 0) / concepts.length).toFixed(1)
        : '0',
    };
  }, [concepts]);

  const recentConcepts = useMemo(
    () => [...concepts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()).slice(0, 8),
    [concepts]
  );

  const urgentConcepts = useMemo(
    () => concepts.filter((c) => c.priority === 'urgent' || c.priority === 'high').slice(0, 5),
    [concepts]
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-1">Dashboard</h2>
        <p className="text-sm text-muted">Overview of your design pipeline</p>
      </div>

      {/* Pipeline Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Ideation" value={stats.ideation} sub="concepts" />
        <StatCard label="In Review" value={stats.inReview} sub="concepts" />
        <StatCard label="Approved" value={stats.approved} sub="concepts" />
        <StatCard label="Ready for Mfg" value={stats.readyForMfg} sub="concepts" />
        <StatCard label="Manufactured" value={stats.manufactured} sub="concepts" />
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Created This Month" value={stats.thisMonth} />
        <StatCard label="Top Collection" value={stats.topCollection} />
        <StatCard label="Avg Approval Time" value={stats.avgApproval} />
        <StatCard label="Avg Versions" value={stats.avgVersions} sub="per concept" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">Recently Updated</h3>
          <div className="space-y-2">
            {recentConcepts.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpenConcept(c.id)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded bg-border placeholder-pattern shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted">{c.collection || 'No collection'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <StatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* High Priority */}
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-semibold mb-3">High Priority</h3>
          <div className="space-y-2">
            {urgentConcepts.length === 0 ? (
              <p className="text-sm text-muted py-4 text-center">No high-priority concepts</p>
            ) : (
              urgentConcepts.map((c) => (
                <button
                  key={c.id}
                  onClick={() => onOpenConcept(c.id)}
                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-surface-hover transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded bg-border placeholder-pattern shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-xs text-muted">{c.designer}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <PriorityBadge priority={c.priority} />
                    <StatusBadge status={c.status} />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Pipeline Visualization */}
      <div className="bg-surface border border-border rounded-xl p-4">
        <h3 className="text-sm font-semibold mb-4">Pipeline Flow</h3>
        <div className="flex items-center gap-2">
          {[
            { label: 'Ideation', count: stats.ideation, color: 'bg-purple-500' },
            { label: 'Review', count: stats.inReview, color: 'bg-yellow-500' },
            { label: 'Approved', count: stats.approved, color: 'bg-green-500' },
            { label: 'Ready', count: stats.readyForMfg, color: 'bg-blue-500' },
            { label: 'Made', count: stats.manufactured, color: 'bg-emerald-500' },
          ].map((stage, i) => {
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
                {i < 4 && <span className="hidden md:block text-muted absolute">→</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
