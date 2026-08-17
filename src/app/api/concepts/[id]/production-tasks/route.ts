import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Production readiness tasks for a concept. GET auto-seeds a default checklist
// on first access so the readiness % is meaningful immediately. Tolerant: an
// unmigrated table returns [] rather than erroring the concept page.

const DEFAULT_TASKS = [
  'Design approved',
  'Dimensions confirmed',
  'Proof / mockup reviewed',
  'Materials & inventory ready',
  'QC passed',
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toFrontend(r: any) {
  return {
    id: r.id,
    conceptId: r.concept_id,
    label: r.label,
    completed: !!r.completed,
    completedAt: r.completed_at ?? null,
    completedBy: r.completed_by ?? null,
    sortOrder: r.sort_order ?? 0,
  };
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from('production_tasks')
      .select('*')
      .eq('concept_id', id)
      .order('sort_order', { ascending: true });
    if (error) {
      console.warn('production_tasks GET failed (table missing?):', error.message);
      return NextResponse.json([]);
    }
    if (data && data.length > 0) return NextResponse.json(data.map(toFrontend));

    // Seed the default checklist. Idempotent: upsert on (concept_id, label) with
    // ignoreDuplicates so two racing first-loads can't create duplicate tasks,
    // then re-select to return the authoritative set regardless of who won.
    const rows = DEFAULT_TASKS.map((label, i) => ({ concept_id: id, label, sort_order: i }));
    const { error: seedErr } = await supabaseAdmin
      .from('production_tasks')
      .upsert(rows, { onConflict: 'concept_id,label', ignoreDuplicates: true });
    if (seedErr) {
      console.warn('production_tasks seed failed:', seedErr.message);
      return NextResponse.json([]);
    }
    const { data: after } = await supabaseAdmin
      .from('production_tasks')
      .select('*')
      .eq('concept_id', id)
      .order('sort_order', { ascending: true });
    return NextResponse.json((after ?? []).map(toFrontend));
  } catch {
    return NextResponse.json([]);
  }
}

// Toggle a task's completion (records timestamp + who).
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taskId, completed, completedBy } = await request.json();
    if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    const update = {
      completed: !!completed,
      completed_at: completed ? new Date().toISOString() : null,
      completed_by: completed ? (completedBy || null) : null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await supabaseAdmin
      .from('production_tasks')
      .update(update)
      .eq('id', taskId)
      .eq('concept_id', id)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(toFrontend(data));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// Add a custom task.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { label, sortOrder } = await request.json();
    if (!label?.trim()) return NextResponse.json({ error: 'label is required' }, { status: 400 });
    const { data, error } = await supabaseAdmin
      .from('production_tasks')
      .insert({ concept_id: id, label: label.trim(), sort_order: sortOrder ?? 99 })
      .select()
      .single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? 'Create failed' }, { status: 500 });
    return NextResponse.json(toFrontend(data), { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}

// Remove a task.
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { taskId } = await request.json();
    if (!taskId) return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    const { error } = await supabaseAdmin.from('production_tasks').delete().eq('id', taskId).eq('concept_id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Unknown error' }, { status: 500 });
  }
}
