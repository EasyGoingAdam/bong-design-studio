import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 30;

/**
 * GET /api/bot/stats — studio situational awareness in one pull: design counts by
 * status, highlighted/favorites, production queue by status, and performance totals.
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  try {
    const [conceptsRes, jobsRes, perfRes] = await Promise.all([
      supabaseAdmin.from('concepts').select('status, highlighted'),
      supabaseAdmin.from('production_jobs').select('status').limit(5000),
      supabaseAdmin.from('design_performance').select('units_sold, revenue').limit(5000),
    ]);

    const designsByStatus: Record<string, number> = {};
    let highlighted = 0;
    for (const c of conceptsRes.data ?? []) {
      designsByStatus[c.status] = (designsByStatus[c.status] ?? 0) + 1;
      if (c.highlighted) highlighted += 1;
    }

    const productionByStatus: Record<string, number> = {};
    for (const j of jobsRes.data ?? []) productionByStatus[j.status] = (productionByStatus[j.status] ?? 0) + 1;

    let unitsSold = 0;
    let revenue = 0;
    for (const p of perfRes.data ?? []) { unitsSold += Number(p.units_sold ?? 0); revenue += Number(p.revenue ?? 0); }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      designs: {
        total: (conceptsRes.data ?? []).length,
        byStatus: designsByStatus,
        highlighted,
      },
      production: {
        total: (jobsRes.data ?? []).length,
        byStatus: productionByStatus,
      },
      performance: {
        recordCount: (perfRes.data ?? []).length,
        unitsSold,
        revenue: Math.round(revenue * 100) / 100,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Stats failed' }, { status: 500 });
  }
}
