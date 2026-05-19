import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withLog, log } from '@/lib/log';

/**
 * GET /api/concepts/{id}/audit?limit=N&before=ISO
 *
 * Returns the concept's mutation history, newest first.
 *
 * Query params:
 *   limit  — default 100, max 500
 *   before — ISO timestamp; only return rows older than this (for cursor pagination)
 */
export const GET = withLog<{ id: string }>('concepts.audit', async (
  req: NextRequest,
  { params }
) => {
  const { id } = await params;
  const url = req.nextUrl;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 500);
  const before = url.searchParams.get('before');

  let query = supabaseAdmin
    .from('concept_audit_log')
    .select('*')
    .eq('concept_id', id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (before) query = query.lt('created_at', before);

  const { data, error } = await query;

  if (error) {
    // 42P01 = table doesn't exist (migration not run). Return empty
    // list instead of 500 so the UI degrades gracefully.
    if (error.code === '42P01') {
      log.warn('concepts.audit.table_missing', { concept_id: id.slice(0, 8) });
      return NextResponse.json({
        events: [],
        warning: 'audit_log_not_configured',
        hint: 'Run supabase-migration-audit-log.sql',
      });
    }
    log.error('concepts.audit.query_fail', {
      concept_id: id.slice(0, 8), err: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Reshape to camelCase + trim defaults for tighter wire payloads.
  const events = (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    actorId: row.actor_id || null,
    actorName: row.actor_name || null,
    before: row.before_data,
    after: row.after_data,
    ipAddress: row.ip_address || null,
    userAgent: row.user_agent || null,
    reqId: row.req_id || null,
    createdAt: row.created_at,
  }));

  return NextResponse.json({ events });
});
