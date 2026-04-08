import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// ---------------------------------------------------------------------------
// PUT /api/concepts/[id]/manufacturing  — upsert manufacturing record
// ---------------------------------------------------------------------------
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const record = {
      concept_id: id,
      machine_ready_notes: body.machineReadyNotes ?? '',
      target_material: body.targetMaterial ?? '',
      etching_settings: body.etchingSettings ?? '',
      estimated_production_time: body.estimatedProductionTime ?? '',
      batch_name: body.batchName ?? '',
      date_sent_to_production: body.dateSentToProduction ?? '',
      date_manufactured: body.dateManufactured ?? '',
      quantity_produced: body.quantityProduced ?? 0,
      qc_notes: body.qcNotes ?? '',
    };

    const { data: mfg, error } = await supabaseAdmin
      .from('manufacturing_records')
      .upsert(record, { onConflict: 'concept_id' })
      .select()
      .single();

    if (error || !mfg) {
      return NextResponse.json({ error: error?.message ?? 'Failed to upsert manufacturing record' }, { status: 500 });
    }

    return NextResponse.json({
      conceptId: mfg.concept_id,
      machineReadyNotes: mfg.machine_ready_notes ?? '',
      targetMaterial: mfg.target_material ?? '',
      etchingSettings: mfg.etching_settings ?? '',
      estimatedProductionTime: mfg.estimated_production_time ?? '',
      batchName: mfg.batch_name ?? '',
      dateSentToProduction: mfg.date_sent_to_production ?? '',
      dateManufactured: mfg.date_manufactured ?? '',
      quantityProduced: mfg.quantity_produced ?? 0,
      qcNotes: mfg.qc_notes ?? '',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
