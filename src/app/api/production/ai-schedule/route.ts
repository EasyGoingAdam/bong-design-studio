import { NextRequest, NextResponse } from 'next/server';
import { withLog } from '@/lib/log';
import { callOpenAIChat } from '@/lib/openai';
import { jobTotalMinutes } from '@/lib/production';
import { ProductionJob, Machine } from '@/lib/types';

export const maxDuration = 180;

/**
 * POST /api/production/ai-schedule
 *
 * The AI brain builds a DRAFT daily plan across the machines. It NEVER
 * writes to the DB — it returns a proposed assignment that the admin reviews,
 * edits, and applies. (Important rule from the spec: AI is the brain, admin
 * is the control point.)
 *
 * Body: { date, jobs: ProductionJob[] (candidates), machines: Machine[],
 *         settings?: { workdayStart, workdayEnd, bufferPct, ... }, apiKey, model? }
 * Returns the structured schedule JSON described in the build plan.
 */
export const POST = withLog('production.ai_schedule', async (req: NextRequest) => {
  let body: {
    date?: string;
    jobs?: ProductionJob[];
    machines?: Machine[];
    settings?: Record<string, unknown>;
    apiKey?: string;
    model?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const jobs = body.jobs ?? [];
  const machines = (body.machines ?? []).filter((m) => m.active);
  if (!body.apiKey) return NextResponse.json({ error: 'apiKey required (OpenAI key)' }, { status: 400 });
  if (machines.length === 0) return NextResponse.json({ error: 'no active machines' }, { status: 400 });
  if (jobs.length === 0) {
    return NextResponse.json({
      schedule_date: body.date,
      assignments: [],
      unscheduled: [],
      daily_summary: { scheduled_pieces: 0, estimated_hours: 0, risk_level: 'Low', risk_notes: ['No candidate jobs.'] },
    });
  }

  const settings = body.settings ?? {};
  const workdayStart = (settings.workdayStart as string) || '09:00';
  const workdayHours = Number(settings.workdayHours ?? 8);
  const bufferPct = Number(settings.bufferPct ?? 15);

  const system =
    'You are a production scheduler for a 2-machine laser-etching shop. ' +
    'Build the best plan for ONE day across the given machines. Return ONLY JSON. ' +
    'RULES (in priority order): ' +
    '1) Jobs without inventory (inventoryAvailable=false) CANNOT be scheduled — list them in unscheduled with reason. ' +
    '2) Past-due and rush/urgent customer orders beat normal orders; customer orders beat testing/internal jobs. ' +
    '3) Each active machine should reach its dailyPieceTarget if enough jobs exist. ' +
    '4) Respect each machine\'s available hours; keep a buffer of ' + bufferPct + '% for issues. ' +
    '5) Avoid stacking many high/very_high complexity jobs back-to-back on one machine. ' +
    '6) Batch similar productType where possible; put lower-risk jobs earlier. ' +
    'Estimate start/end clock times sequentially per machine starting at ' + workdayStart + '. ' +
    'Schema: { "schedule_date": string, "assignments": [ { "job_id": string, ' +
    '"machine_id": string, "position": int, "start_time": "HH:MM", "end_time": "HH:MM", ' +
    '"estimated_minutes": int, "priority_reason": string } ], ' +
    '"unscheduled": [ { "job_id": string, "reason": string } ], ' +
    '"daily_summary": { "scheduled_pieces": int, "estimated_hours": number, ' +
    '"target_pieces": int, "risk_level": "Low"|"Medium"|"High", "risk_notes": [string] } }';

  const compactJobs = jobs.map((j) => ({
    job_id: j.id,
    title: j.title,
    productType: j.productType,
    quantity: j.quantity,
    complexity: j.complexity,
    estimated_minutes: jobTotalMinutes(j),
    priority: j.priority,
    rush: j.rush,
    sourceType: j.sourceType,
    dueDate: j.dueDate,
    shipByDate: j.shipByDate,
    revenueValue: j.revenueValue,
    inventoryAvailable: j.inventoryAvailable,
    repeatDesign: j.repeatDesign,
  }));

  const compactMachines = machines.map((m) => ({
    machine_id: m.id,
    name: m.name,
    daily_piece_target: m.dailyPieceTarget,
    available_hours: m.dailyHours,
  }));

  const user = JSON.stringify({
    date: body.date,
    today: new Date().toISOString().slice(0, 10),
    workday_hours: workdayHours,
    machines: compactMachines,
    candidate_jobs: compactJobs,
  });

  const raw = await callOpenAIChat({
    apiKey: body.apiKey,
    model: body.model || 'gpt-4o',
    jsonMode: true,
    temperature: 0.3,
    maxTokens: 2000,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'AI returned non-JSON schedule' }, { status: 502 }); }

  // Validate job_ids against the candidate set so the client can trust them.
  const validIds = new Set(jobs.map((j) => j.id));
  const validMachineIds = new Set(machines.map((m) => m.id));
  const assignments = Array.isArray(parsed.assignments)
    ? parsed.assignments.filter(
        (a: { job_id: string; machine_id: string }) =>
          validIds.has(a.job_id) && validMachineIds.has(a.machine_id),
      )
    : [];
  const unscheduled = Array.isArray(parsed.unscheduled)
    ? parsed.unscheduled.filter((u: { job_id: string }) => validIds.has(u.job_id))
    : [];

  return NextResponse.json({
    schedule_date: parsed.schedule_date ?? body.date,
    assignments,
    unscheduled,
    daily_summary: parsed.daily_summary ?? {},
  });
});
