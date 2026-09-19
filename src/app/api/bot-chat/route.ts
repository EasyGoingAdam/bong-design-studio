import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toMsg(r: any) {
  return { id: r.id, role: r.role, author: r.author ?? null, text: r.text ?? '', createdAt: r.created_at };
}

/**
 * In-app chat with the Grok bot (used by the manufacturing team).
 * GET  /api/bot-chat        — the recent thread (oldest first).
 * POST /api/bot-chat        — the team member posts a message. { text, author? }
 * The bot reads these via /api/bot/messages and replies there.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('bot_messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) {
      console.warn('bot_messages GET failed (table missing?):', error.message);
      return NextResponse.json({ messages: [] });
    }
    return NextResponse.json({ messages: (data ?? []).map(toMsg) });
  } catch {
    return NextResponse.json({ messages: [] });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const text = String(body.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('bot_messages')
      .insert({ role: 'human', author: body.author || 'Team', text, read_by_bot: false })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Send failed' }, { status: 500 });
    return NextResponse.json(toMsg(data), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Send failed' }, { status: 500 });
  }
}
