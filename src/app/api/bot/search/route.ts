import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 30;

/**
 * GET /api/bot/search?q=&limit= — search designs by name / description / tag.
 * Returns a lean list so the bot can find a design to act on.
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const q = (sp.get('q') || '').trim();
    if (!q) return NextResponse.json({ error: 'q is required' }, { status: 400 });
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '25', 10) || 25, 1), 100);
    // PostgREST .or uses commas/parens as syntax — strip them from the term.
    const safe = q.replace(/[,()%*]/g, ' ').trim();

    // Name/description match, plus exact tag membership.
    const [textRes, tagRes] = await Promise.all([
      supabaseAdmin
        .from('concepts')
        .select('id, external_id, name, status, tags, coil_image_url, collection, highlighted')
        .or(`name.ilike.%${safe}%,description.ilike.%${safe}%`)
        .limit(limit),
      supabaseAdmin
        .from('concepts')
        .select('id, external_id, name, status, tags, coil_image_url, collection, highlighted')
        .contains('tags', [q])
        .limit(limit),
    ]);

    const seen = new Set<string>();
    const merged = [...(textRes.data ?? []), ...(tagRes.data ?? [])].filter((c) => {
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    }).slice(0, limit);

    const results = merged.map((c) => ({
      id: c.id,
      externalId: c.external_id ?? null,
      name: c.name,
      status: c.status,
      tags: c.tags ?? [],
      collection: c.collection ?? '',
      highlighted: !!c.highlighted,
      coilImageUrl: c.coil_image_url ?? '',
    }));
    return NextResponse.json({ query: q, count: results.length, results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Search failed' }, { status: 500 });
  }
}
