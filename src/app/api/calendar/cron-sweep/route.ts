import { NextRequest, NextResponse } from 'next/server';
import { sweepDueMockups, getServerOpenAIKey } from '@/lib/calendar-mockups-server';

// A sweep can generate several images — lift the default function timeout.
export const maxDuration = 300;

/**
 * POST /api/calendar/cron-sweep
 *
 * Autonomous daily job: generate a coil mockup for every event now within the
 * 40-day window that doesn't have one yet. Runs with NO browser, so it reads
 * the stored OpenAI key server-side.
 *
 * Protected by a shared secret (it's on the proxy's public allowlist, so the
 * secret is the only gate). Call it from Railway's scheduler once a day:
 *   curl -X POST https://<app>/api/calendar/cron-sweep -H "x-cron-secret: $CRON_SECRET"
 * Set CRON_SECRET in Railway → Variables. Fails closed if it isn't set.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get('x-cron-secret') || '';
  if (!secret || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const apiKey = await getServerOpenAIKey();
  if (!apiKey) {
    return NextResponse.json({ error: 'No OpenAI key configured in settings' }, { status: 503 });
  }

  try {
    const summary = await sweepDueMockups(apiKey);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sweep failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
