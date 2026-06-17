import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import {
  dbJobToFrontend,
  jobToDbRow,
  insertWithFallback,
  logProduction,
} from '@/lib/production-db';
import { estimateJobMinutes } from '@/lib/production';
import { ProductionJob } from '@/lib/types';

// GET /api/production/jobs — all jobs (the board filters by date client-side).
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('production_jobs')
      .select('*')
      .order('scheduled_position', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json((data ?? []).map(dbJobToFrontend));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/production/jobs — create a job. Auto-fills the deterministic time
// estimate when the caller didn't provide one.
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<ProductionJob> & { actorName?: string };

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ error: 'title required' }, { status: 400 });
    }

    // Baseline estimate if none supplied.
    if (!body.estimatedTotalMinutes || body.estimatedTotalMinutes <= 0) {
      const est = estimateJobMinutes(body);
      body.estimatedSetupMinutes = body.estimatedSetupMinutes ?? est.setup;
      body.estimatedRunMinutes = body.estimatedRunMinutes ?? est.run;
      body.estimatedFinishMinutes = body.estimatedFinishMinutes ?? est.finish;
      body.estimatedTotalMinutes = est.total;
    }

    const row = jobToDbRow(body);
    const { data, error } = await insertWithFallback('production_jobs', row);
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Insert failed' }, { status: 500 });
    }

    const job = dbJobToFrontend(data);
    logProduction({
      productionJobId: job.id,
      action: 'job.create',
      newValue: { title: job.title, source: job.sourceType },
      userName: body.actorName,
    });
    return NextResponse.json(job, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
