import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey, resolveConceptId } from '@/lib/bot-api';

export const maxDuration = 30;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toComment(r: any) {
  return { id: r.id, conceptId: r.concept_id, author: r.user_name ?? '', text: r.text ?? '', createdAt: r.created_at };
}

/**
 * GET  /api/bot/comments?conceptId= | ?externalId= — read notes on a design.
 * POST /api/bot/comments — leave a note. { conceptId? | externalId?, text, author? }
 * Comments show up in the app on the design's Comments tab, so the team sees them.
 */
export async function GET(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;
  const sp = request.nextUrl.searchParams;
  const conceptId = await resolveConceptId({ conceptId: sp.get('conceptId') || undefined, externalId: sp.get('externalId') || undefined });
  if (!conceptId) return NextResponse.json({ error: 'no matching design' }, { status: 404 });
  const { data } = await supabaseAdmin
    .from('comments')
    .select('*')
    .eq('concept_id', conceptId)
    .order('created_at', { ascending: true });
  return NextResponse.json({ comments: (data ?? []).map(toComment) });
}

export async function POST(request: NextRequest) {
  const denied = requireBotKey(request);
  if (denied) return denied;
  try {
    const body = await request.json();
    const text = String(body.text ?? '').trim();
    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 });
    const conceptId = await resolveConceptId({ conceptId: body.conceptId, externalId: body.externalId });
    if (!conceptId) return NextResponse.json({ error: 'no matching design' }, { status: 404 });
    const { data, error } = await supabaseAdmin
      .from('comments')
      .insert({ concept_id: conceptId, user_name: body.author || 'Grok', text })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Comment failed' }, { status: 500 });
    return NextResponse.json(toComment(data), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Comment failed' }, { status: 500 });
  }
}
