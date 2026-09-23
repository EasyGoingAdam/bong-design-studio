import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, uploadImage } from './supabase';
import { validateParams, getOpenAIRequestBody, getEndpoint, getAuthHeaders } from './ai-providers';
import { enforceMonochrome } from './monochrome';

/**
 * Shared helpers for the bot-facing bulk API (`/api/bot/*`).
 *
 * Auth: a shared password passed as either
 *   Authorization: Bearer <password>   or   x-bot-key: <password>
 * The routes are public in the proxy (no user JWT), so this password is the gate.
 *
 * The key is managed in the app's Settings (app_settings.bot_api_key). A default
 * is baked in so the bot works with no setup, and BOT_API_KEY (env) is accepted
 * too. Any of the three matching lets the caller in.
 */

/** Default bot password, used when none is set in Settings or the env. */
export const BOT_PASSWORD = '062119062119';

/** The bot key configured in Settings (app_settings.bot_api_key), or null. */
export async function getServerBotKey(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'bot_api_key')
    .maybeSingle();
  const key = data?.value?.trim();
  return key || null;
}

/** Returns a 401 NextResponse when unauthorized, or null when the caller is allowed. */
export async function requireBotKey(request: NextRequest): Promise<NextResponse | null> {
  // Accept the key from Settings, the BOT_API_KEY env var, and the built-in
  // default — any match is allowed.
  const stored = await getServerBotKey().catch(() => null);
  const accepted = [stored, process.env.BOT_API_KEY, BOT_PASSWORD].filter(Boolean) as string[];
  const auth = request.headers.get('authorization') || '';
  const bearer = /^bearer\s+/i.test(auth) ? auth.replace(/^bearer\s+/i, '').trim() : '';
  const provided = bearer || request.headers.get('x-bot-key') || '';
  if (!provided || !accepted.includes(provided)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

/**
 * Notify the bot instantly of an event (e.g. a new chat message) by POSTing to
 * BOT_WEBHOOK_URL if configured. Fire-and-forget: never blocks or throws into
 * the request path, so a down webhook can't break the app. The bot can verify
 * the caller via the Bearer key we send.
 */
export function notifyBotWebhook(payload: Record<string, unknown>): void {
  const url = process.env.BOT_WEBHOOK_URL;
  if (!url) return;
  // Sign with the same key the bot authenticates with (Settings → env → default).
  getServerBotKey()
    .catch(() => null)
    .then((stored) => {
      const key = stored || process.env.BOT_API_KEY || BOT_PASSWORD;
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
      });
    })
    .catch((err) => console.warn('bot webhook failed:', err instanceof Error ? err.message : err));
}

/** Concept statuses the bot may set. */
export const BOT_STATUSES = [
  'ideation',
  'in_review',
  'approved',
  'ready_for_manufacturing',
  'manufactured',
  'archived',
] as const;

/**
 * Resolve a concept row id from either our uuid (`conceptId`) or the bot's own
 * product id stored on the concept (`externalId`). Returns null if not found.
 */
export async function resolveConceptId(ref: { conceptId?: string; externalId?: string }): Promise<string | null> {
  if (ref.conceptId) {
    const { data } = await supabaseAdmin.from('concepts').select('id').eq('id', ref.conceptId).maybeSingle();
    if (data?.id) return data.id;
  }
  if (ref.externalId) {
    const { data } = await supabaseAdmin
      .from('concepts')
      .select('id')
      .eq('external_id', ref.externalId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  return null;
}

/**
 * Generate a coil design image server-side (using the stored key) and upload it
 * to storage. Returns a public URL, or a data URI if storage upload fails.
 */
export async function generateCoilImageServer(
  prompt: string,
  apiKey: string,
  filename: string,
  size = '1024x1024',
): Promise<string> {
  const params = validateParams({ prompt, provider: 'openai', apiKey, size, quality: 'medium', folder: 'bot', filename });
  const res = await fetch(getEndpoint('openai'), {
    method: 'POST',
    headers: getAuthHeaders(params),
    body: JSON.stringify(getOpenAIRequestBody(params)),
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `OpenAI image error ${res.status}`);
  }
  const data = await res.json();
  const img = data.data?.[0];
  if (!img?.b64_json && !img?.url) throw new Error('No image data in OpenAI response');
  let base64: string;
  if (img.b64_json) {
    base64 = `data:image/png;base64,${img.b64_json}`;
  } else {
    const r = await fetch(img.url);
    base64 = `data:image/png;base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
  }
  // Hard-enforce monochrome: the model's B&W is only a request, so strip any
  // chroma at the pixel level before the image is ever stored.
  base64 = await enforceMonochrome(base64);
  try {
    return await uploadImage(base64, 'bot', filename);
  } catch {
    return base64;
  }
}
