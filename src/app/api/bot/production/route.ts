import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { dbJobToFrontend, jobToDbRow, insertWithFallback, updateWithFallback } from '@/lib/production-db';
import { ProductionJob } from '@/lib/types';
import { requireBotKey, resolveConceptId, notifyBotWebhook } from '@/lib/bot-api';

export const maxDuration = 60;

/**
 * GET /api/bot/production — read the production queue + machines, so the bot
 *   knows the state of manufacturing. Query: status?, limit (<=500).
 *
 * POST /api/bot/production — create/update production jobs (drive what the
 *   laser tech works on next). Mirrors every action in the Production cockpit.
 *   { jobs: [ { id?, conceptId? | externalId?, title?, status?, priority?,
 *              machineId?, scheduledDate?, quantity?, notes?,
 *              action?, quantityCompleted?, quantityFailed?, qcResult?,
 *              qcNotes?, reworkReason?, holdReason? } ] }
 *   status: backlog|scheduled|in_progress|paused|completed|held|rework
 *   action (shortcut, sets status + timestamps): start|resume|pause|complete|
 *          hold|rework|schedule|backlog
 */

const ACTION_STATUS: Record<string, ProductionJob['status']> = {
  start: 'in_progress',
  resume: 'in_progress',
  pause: 'paused',
  complete: 'completed',
  hold: 'held',
  rework: 'rework',
  schedule: 'scheduled',
  backlog: 'backlog',
};
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '200', 10) || 200, 1), 500);
    let q = supabaseAdmin.from('production_jobs').select('*').order('created_at', { ascending: false }).limit(limit);
    if (sp.get('status')) q = q.eq('status', sp.get('status'));
    const { data: jobsRaw, error } = await q;
    if (error) return NextResponse.json({ jobs: [], machines: [] });
    const { data: machines } = await supabaseAdmin.from('machines').select('*');
    return NextResponse.json({
      jobs: (jobsRaw ?? []).map((r) => dbJobToFrontend(r)),
      machines: machines ?? [],
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const jobs: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.jobs) ? body.jobs : [];
    if (jobs.length === 0) return NextResponse.json({ error: 'Provide a non-empty { jobs: [...] } array.' }, { status: 400 });
    if (jobs.length > 200) return NextResponse.json({ error: 'Max 200 jobs per request.' }, { status: 400 });

    const created: string[] = [];
    const updated: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i] as Record<string, unknown>;
      try {
        const partial: Partial<ProductionJob> = {};
        if (j.title != null) partial.title = String(j.title);
        if (j.priority != null) partial.priority = j.priority as ProductionJob['priority'];
        if (j.machineId != null) partial.machineId = String(j.machineId);
        if (j.scheduledDate != null) partial.scheduledDate = String(j.scheduledDate);
        if (j.quantity != null) partial.quantity = Number(j.quantity);
        if (j.quantityCompleted != null) partial.quantityCompleted = Number(j.quantityCompleted);
        if (j.quantityFailed != null) partial.quantityFailed = Number(j.quantityFailed);
        if (j.qcResult === 'pass' || j.qcResult === 'fail') partial.qcResult = j.qcResult;
        if (j.qcNotes != null) partial.qcNotes = String(j.qcNotes);
        if (j.reworkReason != null) partial.reworkReason = String(j.reworkReason);

        // Status: explicit `status` wins, else derive from `action`.
        const action = String(j.action ?? '').toLowerCase();
        const status = (j.status as ProductionJob['status']) ?? ACTION_STATUS[action];
        if (status) partial.status = status;
        // Timestamps that the cockpit stamps for the same transitions.
        if (status === 'in_progress' && action !== 'resume') partial.actualStartTime = new Date().toISOString();
        if (status === 'completed') partial.actualEndTime = new Date().toISOString();
        // A hold reason is appended to notes (matches the cockpit's [HELD] stamp).
        if (j.holdReason != null || status === 'held') {
          const reason = String(j.holdReason ?? j.notes ?? 'Held by bot');
          partial.notes = `[HELD] ${reason}`;
        } else if (j.notes != null) {
          partial.notes = String(j.notes);
        }
        if (j.conceptId || j.externalId) {
          const cid = await resolveConceptId({ conceptId: j.conceptId as string, externalId: j.externalId as string });
          if (cid) partial.conceptId = cid;
        }
        const row = jobToDbRow(partial);
        row.updated_at = new Date().toISOString();

        if (j.id) {
          const { data, error } = await updateWithFallback('production_jobs', String(j.id), row);
          if (error || !data) { errors.push({ index: i, error: error?.message ?? 'not found' }); continue; }
          updated.push(String(j.id));
          if (partial.status === 'completed') {
            notifyBotWebhook({ type: 'production.completed', jobId: String(j.id), conceptId: partial.conceptId ?? null });
          }
        } else {
          if (!partial.title) partial.title = 'Bot job';
          const insertRow = jobToDbRow(partial);
          insertRow.created_at = new Date().toISOString();
          insertRow.updated_at = insertRow.created_at;
          const { data, error } = await insertWithFallback('production_jobs', insertRow);
          if (error || !data) { errors.push({ index: i, error: error?.message ?? 'insert failed' }); continue; }
          created.push((data as { id: string }).id);
        }
      } catch (err) {
        errors.push({ index: i, error: err instanceof Error ? err.message : 'failed' });
      }
    }

    return NextResponse.json({ created, updated, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upsert failed' }, { status: 500 });
  }
}
