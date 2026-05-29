'use client';

import { useMemo } from 'react';
import { Concept } from '@/lib/types';
import { computeReadiness, ReadinessCheck } from '@/lib/readiness';

/**
 * Visual readiness checklist for a single concept.
 *
 * Big percentage + progress bar at the top; grouped check list below. Green
 * ring when ready, amber when close, red when hard-blockers present.
 *
 * Hot-link behavior: when a check carries an `action`, the row becomes a
 * button. Same-tab actions (specs, manufacturing etc.) call onTabChange
 * so concept-detail can switch tabs in place. External actions navigate
 * the whole app — used for the mockup/marketing studios which live
 * outside concept-detail.
 */
type TabId = NonNullable<ReadinessCheck['action']>['tab'];

interface Props {
  concept: Concept;
  /** Called when a check with `action.tab` is clicked — concept-detail
   *  uses this to switch its activeSection without a page navigation. */
  onTabChange?: (tab: NonNullable<TabId>) => void;
}

export function ReadinessChecklist({ concept, onTabChange }: Props) {
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
                {groupChecks.map((c) => {
                  // Build click handler if this check carries an action.
                  // External href wins because it leaves the page; tab
                  // switching stays in-place via onTabChange.
                  const hasAction = !!(c.action?.tab || c.action?.externalHref);
                  const onClick = hasAction
                    ? () => {
                        if (c.action?.externalHref) {
                          const sep = c.action.externalHref.includes('?') ? '&' : '?';
                          const intentQs = c.action.intent ? `${sep}${c.action.intent}` : '';
                          window.location.href = `${c.action.externalHref}${intentQs}`;
                          return;
                        }
                        if (c.action?.tab && onTabChange) onTabChange(c.action.tab);
                      }
                    : undefined;

                  const baseClasses = 'flex items-start gap-2 text-xs w-full text-left';
                  const interactiveClasses = hasAction
                    ? ' rounded-md p-1 -m-1 hover:bg-background cursor-pointer'
                    : '';

                  const content = (
                    <>
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
                        <div className="font-medium leading-tight text-foreground">
                          {c.label}
                          {hasAction && <span className="ml-1 text-accent opacity-70">→</span>}
                        </div>
                        <div className="text-[10px] text-muted leading-snug">{c.detail}</div>
                      </div>
                    </>
                  );

                  return (
                    <li key={c.id}>
                      {hasAction ? (
                        <button
                          type="button"
                          onClick={onClick}
                          className={baseClasses + interactiveClasses}
                          title={`Jump to ${c.label}`}
                        >
                          {content}
                        </button>
                      ) : (
                        <div className={baseClasses}>{content}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
