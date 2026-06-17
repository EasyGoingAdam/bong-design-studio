import { NextRequest, NextResponse } from 'next/server';
import { withLog, log } from '@/lib/log';
import { callOpenAIChat } from '@/lib/openai';
import { estimateJobMinutes } from '@/lib/production';
import { ProductionJob } from '@/lib/types';

export const maxDuration = 120;

/**
 * POST /api/production/ai-estimate
 *
 * The AI "brain" estimates production time for one job. We ALWAYS compute a
 * deterministic baseline first (estimateJobMinutes) and pass it to the model
 * as an anchor, plus any past-production history for similar jobs. If the AI
 * call fails we return the baseline so the feature never hard-blocks.
 *
 * Body: { job: Partial<ProductionJob>, apiKey, model?, history?: [] }
 * Returns: { estimated_setup_minutes, estimated_run_minutes,
 *            estimated_inspection_minutes, estimated_total_minutes,
 *            confidence, reasoning_summary, fallback? }
 */
export const POST = withLog('production.ai_estimate', async (req: NextRequest) => {
  let body: {
    job?: Partial<ProductionJob>;
    apiKey?: string;
    model?: string;
    history?: unknown[];
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const job = body.job;
  if (!job) return NextResponse.json({ error: 'job required' }, { status: 400 });

  const baseline = estimateJobMinutes(job);

  // No key → deterministic baseline, clearly flagged.
  if (!body.apiKey) {
    return NextResponse.json({
      estimated_setup_minutes: baseline.setup,
      estimated_run_minutes: baseline.run,
      estimated_inspection_minutes: baseline.finish,
      estimated_total_minutes: baseline.total,
      confidence: 0.4,
      reasoning_summary: 'Deterministic baseline (no OpenAI key set).',
      fallback: true,
    });
  }

  const system =
    'You estimate laser-etching production time for glass bongs/pipes. ' +
    'You are given one job plus a deterministic baseline and (optionally) ' +
    'historical actuals for similar jobs. Return ONLY JSON with integer ' +
    'minute fields. Be realistic: curved glass, wraparound designs, high ' +
    'detail, difficult alignment, and first-time (non-repeat) designs all ' +
    'add time. Repeat designs are faster (setup known). ' +
    'Schema: { "estimated_setup_minutes": int, "estimated_run_minutes": int, ' +
    '"estimated_inspection_minutes": int, "estimated_total_minutes": int, ' +
    '"confidence": number (0-1), "reasoning_summary": string (<160 chars) }';

  const user = JSON.stringify({
    job: {
      title: job.title,
      productType: job.productType,
      quantity: job.quantity,
      complexity: job.complexity,
      setupComplexity: job.setupComplexity,
      alignmentDifficulty: job.alignmentDifficulty,
      detailLevel: job.detailLevel,
      etchingZones: job.etchingZones,
      repeatDesign: job.repeatDesign,
      designName: job.designName,
      tags: job.tags,
      designNotes: job.designNotes,
    },
    deterministic_baseline_minutes: baseline,
    similar_job_history: body.history ?? [],
  });

  try {
    const raw = await callOpenAIChat({
      apiKey: body.apiKey,
      model: body.model || 'gpt-4o-mini',
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 400,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    });
    const parsed = JSON.parse(raw);
    // Guard: ensure total is consistent.
    const setup = Math.max(0, Math.round(parsed.estimated_setup_minutes ?? baseline.setup));
    const run = Math.max(0, Math.round(parsed.estimated_run_minutes ?? baseline.run));
    const insp = Math.max(0, Math.round(parsed.estimated_inspection_minutes ?? baseline.finish));
    const total = Math.max(setup + run + insp, Math.round(parsed.estimated_total_minutes ?? 0));
    return NextResponse.json({
      estimated_setup_minutes: setup,
      estimated_run_minutes: run,
      estimated_inspection_minutes: insp,
      estimated_total_minutes: total,
      confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.6))),
      reasoning_summary: String(parsed.reasoning_summary ?? '').slice(0, 200),
      fallback: false,
    });
  } catch (err) {
    log.warn('production.ai_estimate.fallback', { err });
    return NextResponse.json({
      estimated_setup_minutes: baseline.setup,
      estimated_run_minutes: baseline.run,
      estimated_inspection_minutes: baseline.finish,
      estimated_total_minutes: baseline.total,
      confidence: 0.4,
      reasoning_summary: 'Baseline used — AI estimate unavailable.',
      fallback: true,
    });
  }
});
