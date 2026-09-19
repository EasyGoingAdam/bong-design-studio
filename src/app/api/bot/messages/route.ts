import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMsg(r: any) {
  return { id: r.id, role: r.role, author: r.author ?? null, text: r.text ?? '', metadata: r.metadata ?? null, createdAt: r.created_at };
}

/**
 * GET /api/bot/messages — the bot pulls messages from the team.
 *   Default: unread human messages (and marks them read). ?all=true for the
 *   whole recent thread (does not mark read). ?limit=.
 *
 * POST /api/bot/messages — the bot posts a reply into the thread.
 *   { text, metadata? }
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const sp = request.nextUrl.searchParams;
    const all = sp.get('all') === 'true';
    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '100', 10) || 100, 1), 500);

    if (all) {
      const { data } = await supabaseAdmin
        .from('bot_messages')
        .select('*')
        .order('created_at', { ascending: true })
        .limit(limit);
      return NextResponse.json({ messages: (data ?? []).map(toMsg) });
    }

    // Unread human messages, oldest first; mark them read after returning.
    const { data, error } = await supabaseAdmin
      .from('bot_messages')
      .select('*')
      .eq('role', 'human')
      .eq('read_by_bot', false)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) return NextResponse.json({ messages: [] });
    const ids = (data ?? []).map((r) => r.id);
    if (ids.length > 0) {
      await supabaseAdmin.from('bot_messages').update({ read_by_bot: true }).in('id', ids);
    }
    return NextResponse.json({ messages: (data ?? []).map(toMsg) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Read failed' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const text = String(body.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('bot_messages')
      .insert({ role: 'bot', author: body.author || 'Grok', text, metadata: body.metadata ?? null, read_by_bot: true })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Post failed' }, { status: 500 });
    return NextResponse.json(toMsg(data), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Post failed' }, { status: 500 });
  }
}
