import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey, BOT_STATUSES } from '@/lib/bot-api';

export const maxDuration = 60;

/**
 * GET /api/bot/designs — bulk export of designs + specs + latest performance.
 * Query: status, collection, updatedSince (ISO), limit (<=500), offset.
 *
 * POST /api/bot/designs — bulk create/update designs.
 *   { "designs": [ { externalId?, id?, name, description?, tags?, status?,
 *                    coilOnly?, coilImageUrl?, baseImageUrl?, collection?,
 *                    coilDimensions?, baseDimensions?, source? }, ... ] }
 *   Matches an existing design by `id` or `externalId`; otherwise inserts.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toExport(c: any, coil: any, base: any, perf: any) {
  return {
    id: c.id,
    externalId: c.external_id ?? null,
    name: c.name,
    status: c.status,
    highlighted: !!c.highlighted,
    collection: c.collection ?? '',
    tags: c.tags ?? [],
    description: c.description ?? '',
    coilOnly: c.coil_only ?? false,
    coilImageUrl: c.coil_image_url ?? '',
    baseImageUrl: c.base_image_url ?? '',
    combinedImageUrl: c.combined_image_url ?? '',
    coilDimensions: coil?.dimensions ?? '',
    baseDimensions: base?.dimensions ?? '',
    designer: c.designer ?? '',
    source: c.source ?? '',
    externalUrl: c.external_url ?? '',
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    // Newest performance snapshot the bot (or Shopify) last reported.
    performance: perf
      ? {
          source: perf.source ?? null,
          unitsSold: perf.units_sold ?? null,
          revenue: perf.revenue ?? null,
          sellThroughRate: perf.sell_through_rate ?? null,
          rating: perf.rating ?? null,
          periodStart: perf.period_start ?? null,
          periodEnd: perf.period_end ?? null,
          metrics: perf.metrics ?? null,
          recordedAt: perf.recorded_at ?? null,
        }
      : null,
  };
}

export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(sp.get('offset') || '0', 10) || 0, 0);

    let q = supabaseAdmin
      .from('concepts')
      .select('*', { count: 'exact' })
      .order('updated_at', { ascending: false })
      .range(offset, offset + limit - 1);
    if (sp.get('status')) q = q.eq('status', sp.get('status'));
    if (sp.get('collection')) q = q.eq('collection', sp.get('collection'));
    if (sp.get('updatedSince')) q = q.gte('updated_at', sp.get('updatedSince'));

    const { data: concepts, error, count } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const ids = (concepts ?? []).map((c) => c.id);
    if (ids.length === 0) {
      return NextResponse.json({ designs: [], count: count ?? 0, limit, offset });
    }

    const [coilRes, baseRes, perfRes] = await Promise.all([
      supabaseAdmin.from('coil_specs').select('concept_id, dimensions').in('concept_id', ids),
      supabaseAdmin.from('base_specs').select('concept_id, dimensions').in('concept_id', ids),
      supabaseAdmin
        .from('design_performance')
        .select('*')
        .in('concept_id', ids)
        .order('recorded_at', { ascending: false }),
    ]);

    const coilMap = new Map((coilRes.data ?? []).map((r) => [r.concept_id, r]));
    const baseMap = new Map((baseRes.data ?? []).map((r) => [r.concept_id, r]));
    // First (newest) performance row per concept.
    const perfMap = new Map<string, unknown>();
    for (const p of perfRes.data ?? []) if (!perfMap.has(p.concept_id)) perfMap.set(p.concept_id, p);

    const designs = (concepts ?? []).map((c) =>
      toExport(c, coilMap.get(c.id), baseMap.get(c.id), perfMap.get(c.id)),
    );
    return NextResponse.json({ designs, count: count ?? designs.length, limit, offset });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Export failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const designs: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.designs) ? body.designs : [];
    if (designs.length === 0) {
      return NextResponse.json({ error: 'Provide a non-empty { designs: [...] } array.' }, { status: 400 });
    }
    if (designs.length > 200) {
      return NextResponse.json({ error: 'Max 200 designs per request.' }, { status: 400 });
    }

    const created: string[] = [];
    const updated: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < designs.length; i++) {
      const d = designs[i] as Record<string, unknown>;
      try {
        const name = String(d.name ?? '').trim();
        if (!name && !d.id && !d.externalId) {
          errors.push({ index: i, error: 'name is required for new designs' });
          continue;
        }
        const status = BOT_STATUSES.includes(d.status as (typeof BOT_STATUSES)[number])
          ? (d.status as string)
          : undefined;
        const coilImageUrl = (d.coilImageUrl as string) ?? '';
        const coilOnly = d.coilOnly ?? (!!coilImageUrl && !d.baseImageUrl);

        // Fields common to insert + update (undefined keys are skipped on update).
        const fields: Record<string, unknown> = {
          name: name || undefined,
          description: d.description,
          tags: Array.isArray(d.tags) ? d.tags : undefined,
          collection: d.collection,
          status,
          coil_only: coilOnly,
          coil_image_url: d.coilImageUrl,
          base_image_url: d.baseImageUrl,
          designer: d.designer ?? 'Grok bot',
          source: d.source ?? 'grok',
          external_id: d.externalId,
          external_url: d.externalUrl,
          updated_at: new Date().toISOString(),
        };
        const clean = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

        // Find existing by id then externalId.
        let existingId: string | null = null;
        if (d.id) {
          const { data } = await supabaseAdmin.from('concepts').select('id').eq('id', d.id).maybeSingle();
          existingId = data?.id ?? null;
        }
        if (!existingId && d.externalId) {
          const { data } = await supabaseAdmin
            .from('concepts')
            .select('id')
            .eq('external_id', d.externalId)
            .maybeSingle();
          existingId = data?.id ?? null;
        }

        let conceptId: string;
        if (existingId) {
          const { error } = await supabaseAdmin.from('concepts').update(clean).eq('id', existingId);
          if (error) { errors.push({ index: i, error: error.message }); continue; }
          conceptId = existingId;
          updated.push(conceptId);
        } else {
          conceptId = uuidv4();
          const { error } = await supabaseAdmin.from('concepts').insert({
            id: conceptId,
            status: status ?? 'ideation',
            ...clean,
            created_at: new Date().toISOString(),
          });
          if (error) { errors.push({ index: i, error: error.message }); continue; }
          created.push(conceptId);
        }

        // Optional dimensions → coil/base specs (upsert on concept_id).
        if (d.coilDimensions) {
          await supabaseAdmin
            .from('coil_specs')
            .upsert({ concept_id: conceptId, dimensions: String(d.coilDimensions) }, { onConflict: 'concept_id' });
        }
        if (d.baseDimensions && !coilOnly) {
          await supabaseAdmin
            .from('base_specs')
            .upsert({ concept_id: conceptId, dimensions: String(d.baseDimensions) }, { onConflict: 'concept_id' });
        }
      } catch (err) {
        errors.push({ index: i, error: err instanceof Error ? err.message : 'failed' });
      }
    }

    return NextResponse.json({ created, updated, errors, createdCount: created.length, updatedCount: updated.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Upsert failed' }, { status: 500 });
  }
}
