import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// PATCH: mark an idea as used (link to concept) or update fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const update: Record<string, unknown> = {};
    if (body.conceptId !== undefined) {
      update.concept_id = body.conceptId;
      update.used_at = body.conceptId ? new Date().toISOString() : null;
    }

    const { error } = await supabaseAdmin
      .from('brainstorm_ideas')
      .update(update)
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to update idea' }, { status: 500 });
  }
}

// DELETE: permanently remove an idea from the archive
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin
      .from('brainstorm_ideas')
      .delete()
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete idea' }, { status: 500 });
  }
}
