import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// POST /api/concepts/[id]/comments  — add comment
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data: comment, error } = await supabaseAdmin
      .from('comments')
      .insert({
        concept_id: id,
        user_name: body.userName ?? '',
        text: body.text ?? '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !comment) {
      return NextResponse.json({ error: error?.message ?? 'Failed to add comment' }, { status: 500 });
    }

    return NextResponse.json({
      id: comment.id,
      conceptId: comment.concept_id,
      userId: comment.user_name ?? '',
      userName: comment.user_name ?? '',
      text: comment.text ?? '',
      createdAt: comment.created_at,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
