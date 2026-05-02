'use client';

import { useMemo } from 'react';
import { Concept } from '@/lib/types';
import { computeReadiness, ReadinessCheck } from '@/lib/readiness';

/**
 * Visual readiness checklist for a single concept.
 *
 * Big percentage + progress bar at the top; grouped check list below. Green
 * ring when ready, amber when close, red when hard-blockers present.
 */
export function ReadinessChecklist({ concept }: { concept: Concept }) {
  // Memoize so the 8-check walk doesn't re-run on every parent render.
  // Concept detail re-renders on every keystroke in any edit field — this
  // saved hundreds of array allocations per second on slow phones.
  const report = useMemo(() => computeReadiness(concept), [concept]);

  const ringColor =
    report.ready ? 'text-green-600'
    : report.failCount > 0 ? 'text-red-600'
    : 'text-amber-600';
  const barColor =
    report.ready ? 'bg-green-500'
    : report.failCount > 0 ? 'bg-red-500'
    : 'bg-amber-500';

  const groups: { id: ReadinessCheck['group']; label: string }[] = [
    { id: 'design', label: 'Design' },
    { id: 'specs', label: 'Specs' },
    { id: 'marketing', label: 'Marketing' },
    { id: 'review', label: 'Review' },
  ];

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-semibold">Production Readiness</h3>
          <p className="text-[11px] text-muted leading-snug">
            {report.ready
              ? '✓ Ready to ship — all critical items complete.'
              : report.failCount > 0
                ? `⚠ Blocked by ${report.failCount} missing requirement${report.failCount > 1 ? 's' : ''}.`
                : 'In progress — knock out the remaining items to ship.'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className={`text-3xl font-bold ${ringColor}`}>{report.percent}%</div>
          <div className="text-[10px] text-muted">{report.passCount}/{report.totalCount} complete</div>
        </div>
      </div>

      <div className="w-full h-1.5 bg-background rounded-full overflow-hidden mb-4">
        <div
          className={`h-full transition-all ${barColor}`}
          style={{ width: `${report.percent}%` }}
        />
      </div>

      <div className="space-y-3">
        {groups.map((g) => {
          const groupChecks = report.checks.filter((c) => c.group === g.id);
          if (groupChecks.length === 0) return null;
          return (
            <div key={g.id}>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">{g.label}</div>
              <ul className="space-y-1.5">
                {groupChecks.map((c) => (
                  <li key={c.id} className="flex items-start gap-2 text-xs">
                    <span
                      className={`shrink-0 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        c.status === 'pass'
                          ? 'bg-green-100 text-green-700'
                          : c.status === 'warn'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {c.status === 'pass' ? '✓' : c.status === 'warn' ? '!' : '✗'}
                    </span>
                    <div className="min-w-0">
                      <div className={`font-medium leading-tight ${c.status === 'pass' ? 'text-foreground' : 'text-foreground'}`}>
                        {c.label}
                      </div>
                      <div className="text-[10px] text-muted leading-snug">{c.detail}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
