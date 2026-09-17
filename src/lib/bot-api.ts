import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './supabase';

/**
 * Shared helpers for the bot-facing bulk API (`/api/bot/*`).
 *
 * Auth: a single shared secret in the BOT_API_KEY env var, passed as either
 *   Authorization: Bearer <key>   or   x-bot-key: <key>
 * The routes are public in the proxy (no user JWT), so this key is the gate.
 */

/** Returns a 401/503 NextResponse when unauthorized, or null when the caller is allowed. */
export function requireBotKey(request: NextRequest): NextResponse | null {
  const configured = process.env.BOT_API_KEY;
  if (!configured) {
    return NextResponse.json(
      { error: 'Bot API not configured. Set BOT_API_KEY in the environment.' },
      { status: 503 },
    );
  }
  const auth = request.headers.get('authorization') || '';
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
  const provided = bearer || request.headers.get('x-bot-key') || '';
  if (!provided || provided !== configured) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/** Concept statuses the bot may set. */
export const BOT_STATUSES = [
  'ideation',
  'in_review',
  'approved',
  'ready_for_manufacturing',
  'manufactured',
  'archived',
] as const;

/**
 * Resolve a concept row id from either our uuid (`conceptId`) or the bot's own
 * product id stored on the concept (`externalId`). Returns null if not found.
 */
export async function resolveConceptId(ref: { conceptId?: string; externalId?: string }): Promise<string | null> {
  if (ref.conceptId) {
    const { data } = await supabaseAdmin.from('concepts').select('id').eq('id', ref.conceptId).maybeSingle();
    if (data?.id) return data.id;
  }
  if (ref.externalId) {
    const { data } = await supabaseAdmin
      .from('concepts')
      .select('id')
      .eq('external_id', ref.externalId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}
