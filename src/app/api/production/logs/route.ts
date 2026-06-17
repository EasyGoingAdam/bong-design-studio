import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET /api/production/logs?jobId=… — recent audit entries for a job (or all).
export async function GET(request: NextRequest) {
  try {
    const jobId = request.nextUrl.searchParams.get('jobId');
    let q = supabaseAdmin
      .from('production_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);
    if (jobId) q = q.eq('production_job_id', jobId);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(
      (data ?? []).map((r) => ({
        id: r.id,
        productionJobId: r.production_job_id,
        action: r.action,
        oldValue: r.old_value,
        newValue: r.new_value,
        userId: r.user_id ?? '',
        userName: r.user_name ?? '',
        reason: r.reason ?? '',
        createdAt: r.created_at,
      })),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
