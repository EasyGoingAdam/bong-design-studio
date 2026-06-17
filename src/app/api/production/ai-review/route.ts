import { NextRequest, NextResponse } from 'next/server';
import { withLog } from '@/lib/log';
import { callOpenAIChat } from '@/lib/openai';
import { jobTotalMinutes } from '@/lib/production';
import { ProductionJob, Machine } from '@/lib/types';

export const maxDuration = 120;

/**
 * POST /api/production/ai-review
 *
 * Pre-lock quality check. Given the proposed schedule (jobs already assigned
 * to machines for the day) plus the still-unscheduled backlog, the AI returns
 * whether it's safe to lock + concrete recommended changes.
 *
 * Body: { date, scheduledJobs: ProductionJob[], backlogJobs: ProductionJob[],
 *         machines: Machine[], apiKey, model? }
 * Returns: { approved_to_lock, issues[], recommended_changes[] }
 */
export const POST = withLog('production.ai_review', async (req: NextRequest) => {
  let body: {
    date?: string;
    scheduledJobs?: ProductionJob[];
    backlogJobs?: ProductionJob[];
    machines?: Machine[];
    apiKey?: string;
    model?: string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  if (!body.apiKey) return NextResponse.json({ error: 'apiKey required (OpenAI key)' }, { status: 400 });

  const machines = (body.machines ?? []).filter((m) => m.active);
  const scheduled = body.scheduledJobs ?? [];
  const backlog = body.backlogJobs ?? [];

  const system =
    'You are a production manager reviewing a daily laser-etching schedule ' +
    'before it is locked. Be skeptical and specific. Check: is anything ' +
    'urgent/past-due/rush left unscheduled? Is either machine overloaded vs ' +
    'its available hours or idle? Are too many high-complexity jobs stacked ' +
    'together? Will the day hit each machine\'s piece target? ' +
    'Return ONLY JSON: { "approved_to_lock": boolean, "issues": [string], ' +
    '"recommended_changes": [string] }. Keep each string concise and actionable.';

  const summarize = (j: ProductionJob) => ({
    job_id: j.id,
    title: j.title,
    machine_id: j.machineId,
    pieces: j.quantity,
    minutes: jobTotalMinutes(j),
    complexity: j.complexity,
    priority: j.priority,
    rush: j.rush,
    dueDate: j.dueDate,
    shipByDate: j.shipByDate,
    sourceType: j.sourceType,
    inventoryAvailable: j.inventoryAvailable,
  });

  const user = JSON.stringify({
    date: body.date,
    today: new Date().toISOString().slice(0, 10),
    machines: machines.map((m) => ({
      machine_id: m.id, name: m.name,
      daily_piece_target: m.dailyPieceTarget, available_hours: m.dailyHours,
    })),
    scheduled_jobs: scheduled.map(summarize),
    backlog_jobs: backlog.map(summarize),
  });

  const raw = await callOpenAIChat({
    apiKey: body.apiKey,
    model: body.model || 'gpt-4o',
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 800,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
  });

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { return NextResponse.json({ error: 'AI returned non-JSON review' }, { status: 502 }); }

  return NextResponse.json({
    approved_to_lock: !!parsed.approved_to_lock,
    issues: Array.isArray(parsed.issues) ? parsed.issues.slice(0, 12) : [],
    recommended_changes: Array.isArray(parsed.recommended_changes)
      ? parsed.recommended_changes.slice(0, 12)
      : [],
  });
});
