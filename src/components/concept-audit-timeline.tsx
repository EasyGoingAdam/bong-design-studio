'use client';

import { useEffect, useState } from 'react';
import { log } from '@/lib/log';

/**
 * Concept Audit Timeline — drop-in section for Concept Detail showing the
 * full mutation history for a single Concept. Lazy-loads on disclosure
 * open so the detail page render stays fast.
 *
 * Server returns { events: [], warning?: 'audit_log_not_configured' } —
 * we surface a hint when the migration hasn't run yet rather than
 * pretending the section is empty.
 */

interface AuditEvent {
  id: string;
  action: string;
  actorId: string | null;
  actorName: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  reqId: string | null;
  createdAt: string;
}

interface Props {
  conceptId: string;
}

/* Human labels per action — fallback to the raw enum if unknown. */
const ACTION_LABELS: Record<string, string> = {
  'concept.create': 'Concept created',
  'concept.update': 'Updated',
  'concept.delete': 'Deleted',
  'concept.move': 'Status moved',
  'concept.image_swap': 'Image swapped',
  'version.add': 'Version saved',
  'version.restore': 'Restored from version',
  'approval.add': 'Approved',
  'comment.add': 'Comment added',
  'comment.delete': 'Comment removed',
  'manufacturing.update': 'Manufacturing details updated',
  'generation.add': 'AI generation saved',
  'share_link.create': 'Share link created',
  'share_link.revoke': 'Share link revoked',
  'import.from_cfp': 'Imported from Customize Freeze Pipe',
};

const ACTION_EMOJI: Record<string, string> = {
  'concept.create': '✨',
  'concept.update': '✎',
  'concept.delete': '✕',
  'concept.move': '↦',
  'concept.image_swap': '🎨',
  'version.add': '◷',
  'version.restore': '↺',
  'approval.add': '✓',
  'comment.add': '💬',
  'comment.delete': '🗑',
  'manufacturing.update': '⚙',
  'generation.add': '✦',
  'share_link.create': '🔗',
  'share_link.revoke': '⊘',
  'import.from_cfp': '↓',
};

export function ConceptAuditTimeline({ conceptId }: Props) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const fetchAudit = async () => {
    if (events !== null || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/concepts/${conceptId}/audit?limit=200`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        log.error('client.audit.fetch_fail', {
          concept_id: conceptId.slice(0, 8), status: res.status,
        });
        setEvents([]);
        return;
      }
      setEvents(Array.isArray(data.events) ? data.events : []);
      if (data.warning) setWarning(data.warning);
    } catch (err) {
      log.warn('client.audit.fetch_exception', {
        concept_id: conceptId.slice(0, 8), err,
      });
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  // Refresh whenever the user re-opens — audit data changes as the team works.
  useEffect(() => {
    if (open) {
      setEvents(null);
      fetchAudit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, conceptId]);

  return (
    <details
      className="bg-surface border border-border rounded-xl"
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="cursor-pointer px-5 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="eyebrow mb-0.5">Activity log</div>
          <div className="text-sm font-medium">
            History &amp; audit trail
            {events !== null && events.length > 0 && (
              <span className="text-muted font-normal"> · {events.length} events</span>
            )}
          </div>
        </div>
        <span className="text-muted text-xs">{open ? 'hide' : 'show'}</span>
      </summary>

      <div className="border-t border-border px-5 py-4">
        {loading && (
          <div className="text-xs text-muted py-4 text-center">Loading…</div>
        )}

        {warning === 'audit_log_not_configured' && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3 text-xs">
            <div className="font-medium text-amber-900 mb-1">Audit log not configured</div>
            <p className="text-amber-800">
              The <span className="mono">concept_audit_log</span> table doesn&apos;t exist yet.
              Run <span className="mono">supabase-migration-audit-log.sql</span> in the Supabase SQL editor
              to enable. Existing mutations work fine — they just aren&apos;t being recorded.
            </p>
          </div>
        )}

        {!loading && events !== null && events.length === 0 && warning !== 'audit_log_not_configured' && (
          <div className="text-xs text-muted py-6 text-center italic">
            No activity recorded yet for this concept.
          </div>
        )}

        {!loading && events !== null && events.length > 0 && (
          <ol className="space-y-2 max-h-96 overflow-y-auto">
            {events.map((ev) => (
              <li
                key={ev.id}
                className="flex gap-3 pb-2 border-b border-border last:border-b-0"
              >
                <div className="text-lg leading-none mt-0.5 shrink-0" aria-hidden>
                  {ACTION_EMOJI[ev.action] || '◦'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap text-xs">
                    <span className="font-medium">
                      {ACTION_LABELS[ev.action] || ev.action}
                    </span>
                    {ev.actorName && (
                      <span className="text-muted">by {ev.actorName}</span>
                    )}
                    <span className="text-muted mono text-[10px]">
                      {new Date(ev.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {/* Diff summary — list fields that changed when this
                      was an update event. */}
                  {ev.after && typeof ev.after === 'object' && (
                    <div className="mt-1 text-[11px] text-muted">
                      {Object.keys(ev.after).slice(0, 6).map((k) => {
                        const beforeVal = ev.before && typeof ev.before === 'object'
                          ? (ev.before as Record<string, unknown>)[k]
                          : undefined;
                        const afterVal = (ev.after as Record<string, unknown>)[k];
                        return (
                          <div key={k} className="truncate">
                            <span className="mono text-foreground/60">{k}:</span>{' '}
                            {beforeVal !== undefined && (
                              <>
                                <span className="line-through opacity-50">{formatValue(beforeVal)}</span>
                                {' → '}
                              </>
                            )}
                            <span>{formatValue(afterVal)}</span>
                          </div>
                        );
                      })}
                      {Object.keys(ev.after).length > 6 && (
                        <div className="text-[10px] opacity-60">
                          +{Object.keys(ev.after).length - 6} more fields
                        </div>
                      )}
                    </div>
                  )}
                  {ev.reqId && (
                    <div className="text-[10px] text-muted mono opacity-60 mt-1">
                      req {ev.reqId}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}

/** Render an audit value safely + concisely for inline diff display. */
function formatValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') {
    if (v.length === 0) return '""';
    return v.length > 40 ? `"${v.slice(0, 40)}…"` : `"${v}"`;
  }
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    const s = JSON.stringify(v);
    return s.length > 40 ? s.slice(0, 40) + '…' : s;
  } catch { return '[obj]'; }
}
