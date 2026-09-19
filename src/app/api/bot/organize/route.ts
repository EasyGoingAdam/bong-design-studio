import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey, resolveConceptId } from '@/lib/bot-api';

export const maxDuration = 60;

/**
 * POST /api/bot/organize — bulk-organize the catalog: move designs into
 * collections and add/remove/replace tags. Lets the bot keep the library tidy
 * without touching status or artwork.
 *   { "items": [ { conceptId? | externalId?, collection?, addTags?, removeTags?,
 *                  setTags?, coilOnly? }, ... ] }
 *   - collection: sets the design's collection (empty string clears it).
 *   - setTags: replaces the whole tag list.
 *   - addTags / removeTags: merged against the existing tags (ignored if setTags given).
 */
export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const items: unknown[] = Array.isArray(body) ? body : Array.isArray(body?.items) ? body.items : [];
    if (items.length === 0) return NextResponse.json({ error: 'Provide a non-empty { items: [...] } array.' }, { status: 400 });
    if (items.length > 500) return NextResponse.json({ error: 'Max 500 items per request.' }, { status: 400 });

    const applied: string[] = [];
    const errors: { index: number; error: string }[] = [];

    for (let i = 0; i < items.length; i++) {
      const it = items[i] as Record<string, unknown>;
      try {
        const conceptId = await resolveConceptId({ conceptId: it.conceptId as string, externalId: it.externalId as string });
        if (!conceptId) { errors.push({ index: i, error: 'no matching design' }); continue; }

        const update: Record<string, unknown> = {};
        if (typeof it.collection === 'string') update.collection = it.collection.trim();
        if (typeof it.coilOnly === 'boolean') update.coil_only = it.coilOnly;

        // Tag maths.
        const norm = (v: unknown) => (Array.isArray(v) ? (v as unknown[]).map((x) => String(x).trim()).filter(Boolean) : []);
        if (Array.isArray(it.setTags)) {
          update.tags = [...new Set(norm(it.setTags))];
        } else if (Array.isArray(it.addTags) || Array.isArray(it.removeTags)) {
          const { data } = await supabaseAdmin.from('concepts').select('tags').eq('id', conceptId).maybeSingle();
          const current = new Set(norm(data?.tags));
          for (const t of norm(it.addTags)) current.add(t);
          for (const t of norm(it.removeTags)) current.delete(t);
          update.tags = [...current];
        }

        if (Object.keys(update).length === 0) { errors.push({ index: i, error: 'nothing to change' }); continue; }
        update.updated_at = new Date().toISOString();
        const { error } = await supabaseAdmin.from('concepts').update(update).eq('id', conceptId);
        if (error) { errors.push({ index: i, error: error.message }); continue; }
        applied.push(conceptId);
      } catch (err) {
        errors.push({ index: i, error: err instanceof Error ? err.message : 'failed' });
      }
    }

    return NextResponse.json({ applied, appliedCount: applied.length, errors });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Organize failed' }, { status: 500 });
  }
}
