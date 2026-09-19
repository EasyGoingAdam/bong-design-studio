import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey, resolveConceptId, BOT_STATUSES, notifyBotWebhook } from '@/lib/bot-api';

export const maxDuration = 60;

/**
 * POST /api/bot/decisions — bulk approve / rate / highlight / archive designs.
 *   { "decisions": [ { conceptId? | externalId?, action?, status?, highlighted?,
 *                      rating?, notes? }, ... ] }
 *
 * action (optional shortcut): approve | ready | manufactured | review |
 *   reject | archive | highlight | unhighlight | rate
 * You can also set `status` directly and/or `highlighted`, and pass `rating`
 * (recorded as a performance row) in the same decision.
 */

const ACTION_STATUS: Record<string, string> = {
  approve: 'approved',
  ready: 'ready_for_manufacturing',
  manufactured: 'manufactured',
  review: 'in_review',
  reject: 'archived',
  archive: 'archived',
};

export async function POST(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const decisions: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.decisions) ? body.decisions : [];
    if (decisions.length === 0) {
      return NextResponse.json({ error: 'Provide a non-empty { decisions: [...] } array.' }, { status: 400 });
    }
    if (decisions.length > 500) {
      return NextResponse.json({ error: 'Max 500 decisions per request.' }, { status: 400 });
    }

    const applied: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < decisions.length; i++) {
      const d = decisions[i] as Record<string, unknown>;
      try {
        const conceptId = await resolveConceptId({ conceptId: d.conceptId as string, externalId: d.externalId as string });
        if (!conceptId) { errors.push({ index: i, error: 'no matching design' }); continue; }

        const action = String(d.action ?? '').toLowerCase();
        const update: Record<string, unknown> = {};

        // Status: explicit `status` wins, else derive from action.
        const explicitStatus = BOT_STATUSES.includes(d.status as (typeof BOT_STATUSES)[number]) ? (d.status as string) : undefined;
        const actionStatus = ACTION_STATUS[action];
        const status = explicitStatus ?? actionStatus;
        if (status) update.status = status;
        if (status === 'archived') update.archived_at = new Date().toISOString();

        // Highlight (favorite).
        if (typeof d.highlighted === 'boolean') update.highlighted = d.highlighted;
        else if (action === 'highlight') update.highlighted = true;
        else if (action === 'unhighlight') update.highlighted = false;

        // Priority (prioritize favorite designs).
        if (['urgent', 'high', 'medium', 'low'].includes(String(d.priority))) {
          update.priority = d.priority;
        }

        if (Object.keys(update).length > 0) {
          update.updated_at = new Date().toISOString();
          const { error } = await supabaseAdmin.from('concepts').update(update).eq('id', conceptId);
          if (error) { errors.push({ index: i, error: error.message }); continue; }
        }

        // A rating is recorded as a performance row so the bot's scoring history
        // is preserved (and shows up in the export's latest performance).
        if (d.rating != null || action === 'rate') {
          await supabaseAdmin.from('design_performance').insert({
            concept_id: conceptId,
            source: 'grok',
            rating: d.rating ?? null,
            notes: d.notes ?? null,
          });
        }

        applied.push(conceptId);
        // Instant event to the bot on approval / ready-for-production.
        if (status === 'approved' || status === 'ready_for_manufacturing') {
          notifyBotWebhook({ type: 'design.approved', conceptId, externalId: (d.externalId as string) ?? null, status });
        }
      } catch (err) {
        errors.push({ index: i, error: err instanceof Error ? err.message : 'failed' });
      }
    }

    return NextResponse.json({ applied, appliedCount: applied.length, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Decisions failed' }, { status: 500 });
  }
}
