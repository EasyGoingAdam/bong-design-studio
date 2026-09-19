import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey, resolveConceptId } from '@/lib/bot-api';

export const maxDuration = 30;

/**
 * GET /api/bot/design?conceptId= | ?externalId= — the full deep view of ONE
 * design: concept fields, coil + base specs, every comment, and the entire
 * performance history. Use this when the bot needs everything about a single
 * piece (the bulk /api/bot/designs export only carries the latest snapshot).
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const conceptId = await resolveConceptId({ conceptId: sp.get('conceptId') || undefined, externalId: sp.get('externalId') || undefined });
    if (!conceptId) return NextResponse.json({ error: 'no matching design' }, { status: 404 });

    const [{ data: c }, coilRes, baseRes, commentsRes, perfRes] = await Promise.all([
      supabaseAdmin.from('concepts').select('*').eq('id', conceptId).maybeSingle(),
      supabaseAdmin.from('coil_specs').select('*').eq('concept_id', conceptId).maybeSingle(),
      supabaseAdmin.from('base_specs').select('*').eq('concept_id', conceptId).maybeSingle(),
      supabaseAdmin.from('comments').select('*').eq('concept_id', conceptId).order('created_at', { ascending: true }),
      supabaseAdmin.from('design_performance').select('*').eq('concept_id', conceptId).order('recorded_at', { ascending: false }),
    ]);
    if (!c) return NextResponse.json({ error: 'no matching design' }, { status: 404 });

    return NextResponse.json({
      design: {
        id: c.id,
        externalId: c.external_id ?? null,
        name: c.name,
        status: c.status,
        highlighted: !!c.highlighted,
        priority: c.priority ?? null,
        collection: c.collection ?? '',
        tags: c.tags ?? [],
        description: c.description ?? '',
        coilOnly: c.coil_only ?? false,
        coilImageUrl: c.coil_image_url ?? '',
        baseImageUrl: c.base_image_url ?? '',
        combinedImageUrl: c.combined_image_url ?? '',
        coilDimensions: coilRes.data?.dimensions ?? '',
        baseDimensions: baseRes.data?.dimensions ?? '',
        coilSpec: coilRes.data ?? null,
        baseSpec: baseRes.data ?? null,
        designer: c.designer ?? '',
        source: c.source ?? '',
        externalUrl: c.external_url ?? '',
        createdAt: c.created_at,
        updatedAt: c.updated_at,
        archivedAt: c.archived_at ?? null,
      },
      comments: (commentsRes.data ?? []).map((r) => ({ id: r.id, author: r.user_name ?? '', text: r.text ?? '', createdAt: r.created_at })),
      performanceHistory: (perfRes.data ?? []).map((p) => ({
        source: p.source ?? null,
        unitsSold: p.units_sold ?? null,
        revenue: p.revenue ?? null,
        sellThroughRate: p.sell_through_rate ?? null,
        rating: p.rating ?? null,
        metrics: p.metrics ?? null,
        notes: p.notes ?? null,
        recordedAt: p.recorded_at ?? null,
      })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read failed' }, { status: 500 });
  }
}
