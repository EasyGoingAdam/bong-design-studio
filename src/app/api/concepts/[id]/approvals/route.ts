import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// POST /api/concepts/[id]/approvals  — add approval log
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data: approval, error } = await supabaseAdmin
      .from('approval_logs')
      .insert({
        concept_id: id,
        user_name: body.userName ?? '',
        action: body.action,
        from_stage: body.fromStage ?? null,
        to_stage: body.toStage ?? null,
        notes: body.notes ?? '',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error || !approval) {
      return NextResponse.json({ error: error?.message ?? 'Failed to add approval log' }, { status: 500 });
    }

    return NextResponse.json({
      id: approval.id,
      conceptId: approval.concept_id,
      userId: approval.user_name ?? '',
      userName: approval.user_name ?? '',
      action: approval.action,
      fromStage: approval.from_stage,
      toStage: approval.to_stage,
      notes: approval.notes ?? '',
      createdAt: approval.created_at,
    }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
