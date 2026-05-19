/**
 * Concept audit log — records every Concept-state mutation for "who did
 * what when" forensics. Writes are best-effort: if the table doesn't
 * exist or Supabase is down, the mutation still succeeds and the audit
 * miss is logged as a warning (so production keeps working in degraded
 * mode while migrations propagate).
 *
 * Read via GET /api/concepts/{id}/audit.
 *
 * To enable on a fresh database, run:
 *   supabase-migration-audit-log.sql
 */

import type { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';
import { log, newRequestId } from './log';

export type AuditAction =
  | 'concept.create'
  | 'concept.update'
  | 'concept.delete'
  | 'concept.move'
  | 'concept.image_swap'
  | 'version.add'
  | 'version.restore'
  | 'approval.add'
  | 'comment.add'
  | 'comment.delete'
  | 'manufacturing.update'
  | 'generation.add'
  | 'share_link.create'
  | 'share_link.revoke'
  | 'import.from_cfp';

export interface AuditActor {
  id?: string;
  name?: string;
}

export interface AuditOpts {
  conceptId: string;
  action: AuditAction;
  actor?: AuditActor;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  request?: NextRequest | Request;
  reqId?: string;
}

/**
 * Capture only fields that actually changed. Trims audit-log noise so
 * a row update from {a:1,b:2,c:3} → {a:1,b:9,c:3} stores `{b: {from:2, to:9}}`
 * not the whole object. Returns null if nothing changed.
 */
export function diffShallow(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): { before: Record<string, unknown>; after: Record<string, unknown> } | null {
  const beforeDiff: Record<string, unknown> = {};
  const afterDiff: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  let changed = false;
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      beforeDiff[k] = before[k];
      afterDiff[k] = after[k];
      changed = true;
    }
  }
  return changed ? { before: beforeDiff, after: afterDiff } : null;
}

/**
 * Write an audit entry. Always returns; never throws. The caller has
 * already done the real work — this is observability, not a transaction.
 */
export async function logAudit(opts: AuditOpts): Promise<void> {
  const reqId = opts.reqId || newRequestId();
  const row = {
    concept_id: opts.conceptId,
    action: opts.action,
    actor_id: opts.actor?.id || '',
    actor_name: opts.actor?.name || '',
    before_data: opts.before ?? null,
    after_data: opts.after ?? null,
    ip_address: opts.request?.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '',
    user_agent: opts.request?.headers.get('user-agent')?.slice(0, 200) || '',
    req_id: reqId,
  };

  try {
    const { error } = await supabaseAdmin
      .from('concept_audit_log')
      .insert(row);

    if (error) {
      // 42P01 = undefined_table — surface so a missing migration is loud
      // in logs but doesn't break the mutation.
      log.warn('audit.insert.fail', {
        action: opts.action,
        concept_id: opts.conceptId.slice(0, 8),
        code: error.code,
        err: error.message,
      });
      return;
    }

    log.info('audit.recorded', {
      action: opts.action,
      concept_id: opts.conceptId.slice(0, 8),
      actor: opts.actor?.name,
      req_id: reqId,
    });
  } catch (err) {
    log.warn('audit.insert.exception', {
      action: opts.action,
      concept_id: opts.conceptId.slice(0, 8),
      err,
    });
  }
}

/**
 * Convenience: log an audit entry without awaiting. Used when the audit
 * write would otherwise slow a hot mutation path. Fire-and-forget.
 * Returns immediately; failures are still logged via .warn.
 */
export function logAuditAsync(opts: AuditOpts): void {
  void logAudit(opts);
}
