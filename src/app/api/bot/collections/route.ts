import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 30;

/**
 * GET /api/bot/collections — every collection with how many designs it holds
 * and a status breakdown, so the bot can see how the catalog is organized and
 * where the gaps are. Designs with no collection are grouped under "(none)".
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const { data, error } = await supabaseAdmin.from('concepts').select('collection, status, highlighted').limit(10000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    type Col = { collection: string; designs: number; highlighted: number; byStatus: Record<string, number> };
    const map = new Map<string, Col>();
    for (const row of data ?? []) {
      const key = (row.collection && String(row.collection).trim()) || '(none)';
      const col: Col = map.get(key) ?? { collection: key, designs: 0, highlighted: 0, byStatus: {} };
      col.designs += 1;
      if (row.highlighted) col.highlighted += 1;
      const st = String(row.status ?? 'unknown');
      col.byStatus[st] = (col.byStatus[st] ?? 0) + 1;
      map.set(key, col);
    }
    const collections = [...map.values()].sort((a, b) => b.designs - a.designs || a.collection.localeCompare(b.collection));
    return NextResponse.json({ count: collections.length, collections });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Collections failed' }, { status: 500 });
  }
}
