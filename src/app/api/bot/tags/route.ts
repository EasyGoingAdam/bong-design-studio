import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 30;

/**
 * GET /api/bot/tags — the catalog's tag vocabulary with usage counts, so the
 * bot knows which tags already exist (and how common they are) before it
 * invents new ones. Query: limit (default 200, <=1000).
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const limit = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('limit') || '200', 10) || 200, 1), 1000);
    const { data, error } = await supabaseAdmin.from('concepts').select('tags').limit(10000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      if (!Array.isArray(row.tags)) continue;
      for (const t of row.tags as string[]) {
        const tag = String(t).trim();
        if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    const tags = [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
      .slice(0, limit);
    return NextResponse.json({ count: tags.length, tags });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Tags failed' }, { status: 500 });
  }
}
