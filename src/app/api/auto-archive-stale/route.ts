import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { withLog, log, timer } from '@/lib/log';

/**
 * POST /api/auto-archive-stale
 *
 * Sweep ideation concepts that have been sitting > 30 days with NO
 * image generated and move them to archived. The "stale ideation"
 * column gets bloated with abandoned drafts otherwise — designers
 * brainstorm, never follow through, and the board becomes noise.
 *
 * Idempotent: anything already archived is skipped via the WHERE clause.
 *
 * Body / query (both optional):
 *   stalenessDays — default 30
 *   dryRun        — '1' to only count without mutating (preview mode)
 *
 * Returns:
 *   { archivedCount: number, candidateIds: string[], dryRun: boolean }
 */
export const POST = withLog('auto_archive_stale', async (req: NextRequest) => {
  const url = req.nextUrl;
  let body: { stalenessDays?: number; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* no body is fine */ }

  const stalenessDays = Math.max(
    1,
    body.stalenessDays
      ?? Number(url.searchParams.get('stalenessDays'))
      ?? 30
  );
  const dryRun =
    body.dryRun === true
    || url.searchParams.get('dryRun') === '1';

  const cutoff = new Date(Date.now() - stalenessDays * 86_400_000).toISOString();
  const t = timer();

  // Find candidates: status='ideation', created_at < cutoff, no coil image
  // AND no base image. Empty-string and null both mean "no image" in this
  // schema.
  const { data: candidates, error: selectErr } = await supabaseAdmin
    .from('concepts')
    .select('id, name, created_at, coil_image_url, base_image_url')
    .eq('status', 'ideation')
    .lt('created_at', cutoff);

  if (selectErr) {
    log.error('auto_archive_stale.select_fail', { err: selectErr.message });
    return NextResponse.json({ error: selectErr.message }, { status: 500 });
  }

  // Belt-and-brace: filter again client-side so we never archive anything
  // that has even an empty-string coil/base URL trickery.
  const targets = (candidates ?? []).filter((c) => {
    const noCoil = !c.coil_image_url || c.coil_image_url.trim() === '';
    const noBase = !c.base_image_url || c.base_image_url.trim() === '';
    return noCoil && noBase;
  });

  if (targets.length === 0) {
    log.info('auto_archive_stale.nothing_to_do', { duration_ms: t() });
    return NextResponse.json({
      archivedCount: 0,
      candidateIds: [],
      dryRun,
      stalenessDays,
    });
  }

  if (dryRun) {
    log.info('auto_archive_stale.dry_run', {
      candidate_count: targets.length, duration_ms: t(),
    });
    return NextResponse.json({
      archivedCount: 0,
      candidateIds: targets.map((c) => c.id),
      dryRun: true,
      stalenessDays,
    });
  }

  const ids = targets.map((c) => c.id);
  const nowIso = new Date().toISOString();

  const { error: updateErr } = await supabaseAdmin
    .from('concepts')
    .update({ status: 'archived', archived_at: nowIso, updated_at: nowIso })
    .in('id', ids);

  if (updateErr) {
    // Fallback: try without the archived_at column in case that column
    // hasn't been migrated yet. Won't fail the whole batch.
    log.warn('auto_archive_stale.update_with_archived_at_fail', {
      err: updateErr.message,
    });
    const { error: fallbackErr } = await supabaseAdmin
      .from('concepts')
      .update({ status: 'archived', updated_at: nowIso })
      .in('id', ids);
    if (fallbackErr) {
      log.error('auto_archive_stale.update_fallback_fail', { err: fallbackErr.message });
      return NextResponse.json({ error: fallbackErr.message }, { status: 500 });
    }
  }

  log.info('auto_archive_stale.archived', {
    count: ids.length, staleness_days: stalenessDays, duration_ms: t(),
  });

  return NextResponse.json({
    archivedCount: ids.length,
    candidateIds: ids,
    dryRun: false,
    stalenessDays,
  });
});
