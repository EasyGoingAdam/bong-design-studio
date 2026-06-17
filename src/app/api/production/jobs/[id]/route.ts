import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  dbJobToFrontend,
  jobToDbRow,
  updateWithFallback,
  logProduction,
} from '@/lib/production-db';
import { ProductionJob } from '@/lib/types';

// PATCH /api/production/jobs/[id] — update a job. `overrideReason` is logged
// (used when changing a job on a locked schedule).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await request.json()) as Partial<ProductionJob> & {
      actorName?: string;
      overrideReason?: string;
    };

    const row = jobToDbRow(body);
    row.updated_at = new Date().toISOString();

    const { data, error } = await updateWithFallback('production_jobs', id, row);
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Update failed' }, { status: 500 });
    }

    const job = dbJobToFrontend(data);
    // Log status changes + locked-schedule overrides for accountability.
    if (body.status || body.overrideReason || body.machineId !== undefined || body.scheduledDate !== undefined) {
      logProduction({
        productionJobId: id,
        action: body.overrideReason ? 'job.override' : 'job.update',
        newValue: {
          status: job.status,
          machineId: job.machineId,
          scheduledDate: job.scheduledDate,
        },
        reason: body.overrideReason,
        userName: body.actorName,
      });
    }
    return NextResponse.json(job);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/production/jobs/[id]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { error } = await supabaseAdmin.from('production_jobs').delete().eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    logProduction({ productionJobId: id, action: 'job.delete' });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
