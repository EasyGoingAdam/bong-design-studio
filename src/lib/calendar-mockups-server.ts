/**
 * Calendar auto-mockups — server-only logic (OpenAI generation, storage
 * upload, and calendar_mockups DB writes). Shared by the on-demand generate
 * route and the autonomous cron sweep so both behave identically.
 *
 * Server-only: imported only by route handlers. It reaches for supabaseAdmin
 * (service-role) and the stored OpenAI key, so never import it into a client
 * component.
 */

import { supabaseAdmin, uploadImage } from './supabase';
import {
  validateParams,
  getOpenAIRequestBody,
  getEndpoint,
  getAuthHeaders,
  PROVIDER_CONFIG,
} from './ai-providers';
import { HOLIDAY_EVENTS, HolidayEvent, nextOccurrence } from './holiday-events';
import {
  CalendarMockup,
  WINDOW_DAYS,
  buildEventCoilPrompt,
  eventsWithinWindow,
} from './calendar-mockups';

const TABLE = 'calendar_mockups';

/** Local YYYY-MM-DD (avoid UTC off-by-one from toISOString). */
function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapRow(row: any): CalendarMockup {
  return {
    id: row.id,
    eventId: row.event_id,
    eventName: row.event_name ?? '',
    occurrenceYear: row.occurrence_year,
    occurrenceDate: row.occurrence_date ?? null,
    imageUrl: row.image_url ?? '',
    prompt: row.prompt ?? '',
    status: row.status === 'failed' ? 'failed' : 'ready',
    error: row.error ?? null,
    kept: !!row.kept,
    regenCount: row.regen_count ?? 0,
    model: row.model ?? null,
    provider: row.provider ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Generate one coil design image via OpenAI and upload it to storage.
 * Returns the public URL plus provenance. Throws on generation failure.
 */
async function generateCoilImage(
  prompt: string,
  apiKey: string,
  filename: string,
): Promise<{ url: string; model: string; provider: string }> {
  const params = validateParams({
    prompt,
    provider: 'openai',
    apiKey,
    size: '1024x1024',
    quality: 'medium',
    folder: 'calendar',
    filename,
  });
  const res = await fetch(getEndpoint('openai'), {
    method: 'POST',
    headers: getAuthHeaders(params),
    body: JSON.stringify(getOpenAIRequestBody(params)),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `OpenAI image API error: ${res.status}`);
  }
  const data = await res.json();
  const img = data.data?.[0];
  if (!img?.b64_json && !img?.url) throw new Error('No image data in OpenAI response');

  let base64: string;
  if (img.b64_json) {
    base64 = `data:image/png;base64,${img.b64_json}`;
  } else {
    const imgRes = await fetch(img.url);
    if (!imgRes.ok) throw new Error(`Failed to download generated image (${imgRes.status})`);
    base64 = `data:image/png;base64,${Buffer.from(await imgRes.arrayBuffer()).toString('base64')}`;
  }

  let url: string;
  try {
    url = await uploadImage(base64, 'calendar', filename);
  } catch (uploadErr) {
    // Storage hiccup shouldn't lose the render — fall back to the data URI.
    console.error('[calendar-mockups] upload failed, using data URI:', uploadErr);
    url = base64;
  }
  return { url, model: PROVIDER_CONFIG.openai.model, provider: 'openai' };
}

/**
 * Look up the calendar_mockups row for an event/year, or null.
 * Throws if the table itself is unavailable (e.g. migration not applied) so
 * callers bail BEFORE spending an OpenAI generation they can't store.
 */
async function existingRow(eventId: string, occurrenceYear: number) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select('*')
    .eq('event_id', eventId)
    .eq('occurrence_year', occurrenceYear)
    .maybeSingle();
  // maybeSingle() leaves error null for "no rows" — a set error means a real
  // problem (missing table, permissions), so don't generate against it.
  if (error) throw new Error(`calendar_mockups unavailable: ${error.message}`);
  return data ?? null;
}

export interface GenerateResult {
  status: 'generated' | 'skipped' | 'failed';
  mockup?: CalendarMockup;
  reason?: string;
}

/**
 * Generate (or regenerate) and persist the coil mockup for one event.
 *
 *  - Skips when a READY row already exists and `force` is false (so the auto
 *    paths never duplicate or overwrite work).
 *  - `force` (explicit Regenerate) rotates the design direction and clears the
 *    `kept` flag — the fresh image isn't pinned until the user keeps it again.
 *  - A KEPT row is only ever touched on an explicit `force`.
 */
export async function generateAndStoreMockup(
  event: HolidayEvent,
  occurrence: Date,
  apiKey: string,
  opts: { force?: boolean } = {},
): Promise<GenerateResult> {
  const occurrenceYear = occurrence.getFullYear();
  let existing;
  try {
    existing = await existingRow(event.id, occurrenceYear);
  } catch (e) {
    // Table unavailable — bail before spending an OpenAI generation.
    return { status: 'failed', reason: e instanceof Error ? e.message : 'lookup failed' };
  }

  if (existing && existing.status === 'ready' && !opts.force) {
    return { status: 'skipped', mockup: mapRow(existing), reason: 'already exists' };
  }
  if (existing?.kept && !opts.force) {
    return { status: 'skipped', mockup: mapRow(existing), reason: 'kept' };
  }

  const regenCount = opts.force && existing ? (existing.regen_count ?? 0) + 1 : (existing?.regen_count ?? 0);
  const prompt = buildEventCoilPrompt(event, regenCount);

  let gen: { url: string; model: string; provider: string };
  try {
    gen = await generateCoilImage(prompt, apiKey, `${event.id}-${occurrenceYear}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'generation failed';
    // Record the failure so the UI can show it and the sweep can retry.
    const failPayload = {
      event_id: event.id,
      event_name: event.name,
      occurrence_year: occurrenceYear,
      occurrence_date: dateKey(occurrence),
      prompt,
      status: 'failed',
      error: message,
      regen_count: regenCount,
      kept: false,
      updated_at: new Date().toISOString(),
    };
    await supabaseAdmin.from(TABLE).upsert(failPayload, { onConflict: 'event_id,occurrence_year' });
    return { status: 'failed', reason: message };
  }

  const payload = {
    event_id: event.id,
    event_name: event.name,
    occurrence_year: occurrenceYear,
    occurrence_date: dateKey(occurrence),
    image_url: gen.url,
    prompt,
    status: 'ready',
    error: null,
    regen_count: regenCount,
    kept: false,
    model: gen.model,
    provider: gen.provider,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, { onConflict: 'event_id,occurrence_year' })
    .select('*')
    .single();
  if (error) return { status: 'failed', reason: error.message };
  return { status: 'generated', mockup: mapRow(data) };
}

/** Resolve a HolidayEvent + its next occurrence by id, or null. */
export function resolveEvent(eventId: string): { event: HolidayEvent; occurrence: Date } | null {
  const event = HOLIDAY_EVENTS.find((e) => e.id === eventId);
  if (!event) return null;
  const occurrence = nextOccurrence(event);
  if (!occurrence) return null;
  return { event, occurrence };
}

export interface SweepSummary {
  windowDays: number;
  candidates: number;
  generated: number;
  skipped: number;
  failed: number;
}

/**
 * Generate mockups for every event now within WINDOW_DAYS that doesn't already
 * have a ready image. Sequential to stay gentle on the OpenAI rate limit.
 */
export async function sweepDueMockups(apiKey: string): Promise<SweepSummary> {
  const due = eventsWithinWindow(HOLIDAY_EVENTS);
  const summary: SweepSummary = {
    windowDays: WINDOW_DAYS,
    candidates: due.length,
    generated: 0,
    skipped: 0,
    failed: 0,
  };
  for (const { event, occurrence } of due) {
    const result = await generateAndStoreMockup(event, occurrence, apiKey);
    if (result.status === 'generated') summary.generated++;
    else if (result.status === 'skipped') summary.skipped++;
    else summary.failed++;
  }
  return summary;
}

/** Read the stored OpenAI key server-side (background jobs have no browser key). */
export async function getServerOpenAIKey(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'openai_key')
    .maybeSingle();
  const key = data?.value?.trim();
  return key || null;
}
