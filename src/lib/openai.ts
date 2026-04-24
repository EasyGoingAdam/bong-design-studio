/**
 * Shared OpenAI helpers for all server routes.
 *
 * Before this existed, every route re-implemented:
 *   - API key validation
 *   - fetch() with Bearer header
 *   - !res.ok error parsing ({error:{message}} unwrap)
 *   - JSON-mode response extraction with fallback
 *   - NO REQUEST TIMEOUTS — the big one. OpenAI image edits can stall
 *     60–90s; without AbortSignal the serverless function hung
 *     indefinitely, blocking slots.
 *
 * Every chat / vision / JSON route now calls callOpenAIChat().
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content:
    | string
    | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

export interface ChatOptions {
  apiKey: string;
  model?: string;
  messages: ChatMessage[];
  /** Force the model to return valid JSON */
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** Abort after N ms — defaults to 90_000 */
  timeoutMs?: number;
}

export interface OpenAIError extends Error {
  status: number;
}

/**
 * One-shot chat completion. Returns the raw assistant string. Callers do
 * their own parsing (JSON.parse, etc.) so we don't force a shape.
 *
 * Throws an OpenAIError with .status when the API rejects the request,
 * so callers can bubble the real HTTP status up to the client.
 */
export async function callOpenAIChat(opts: ChatOptions): Promise<string> {
  if (!opts.apiKey) {
    const err = new Error('OpenAI API key required') as OpenAIError;
    err.status = 400;
    throw err;
  }

  const body: Record<string, unknown> = {
    model: opts.model || 'gpt-4o-mini',
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 500,
  };
  if (typeof opts.temperature === 'number') body.temperature = opts.temperature;
  if (opts.jsonMode) body.response_format = { type: 'json_object' };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), opts.timeoutMs ?? 90_000);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${opts.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as { name?: string })?.name === 'AbortError') {
      const e = new Error('OpenAI request timed out — try a shorter prompt or retry.') as OpenAIError;
      e.status = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let message = `OpenAI error ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message || message;
    } catch {
      if (raw) message = `${message} — ${raw.slice(0, 400)}`;
    }
    const err = new Error(message) as OpenAIError;
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

/**
 * Safe JSON.parse. If the model returns invalid JSON we bubble the issue
 * as a specific error rather than letting callers crash with SyntaxError.
 */
export function parseJsonResponse<T = unknown>(raw: string, fallback?: T): T {
  try {
    return JSON.parse(raw || '{}') as T;
  } catch {
    if (fallback !== undefined) return fallback;
    const e = new Error('Model returned invalid JSON') as OpenAIError;
    e.status = 500;
    throw e;
  }
}

/**
 * Call an OpenAI image-edits endpoint with multipart form-data.
 * Handles timeout + error parsing uniformly so routes don't duplicate it.
 *
 * The form must be fully built by the caller (images, prompt, model, size,
 * quality, etc.) since every route has slightly different multipart needs.
 */
export async function callOpenAIImageEdit(
  form: FormData,
  apiKey: string,
  timeoutMs = 180_000
): Promise<{ b64_json?: string; url?: string }> {
  if (!apiKey) {
    const err = new Error('OpenAI API key required') as OpenAIError;
    err.status = 400;
    throw err;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if ((err as { name?: string })?.name === 'AbortError') {
      const e = new Error('OpenAI image edit timed out — retry or simplify the request.') as OpenAIError;
      e.status = 504;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const raw = await response.text().catch(() => '');
    let message = `OpenAI image edit error: ${response.status}`;
    try {
      const parsed = JSON.parse(raw);
      message = parsed?.error?.message || message;
    } catch {
      if (raw) message = `${message} — ${raw.slice(0, 400)}`;
    }
    const err = new Error(message) as OpenAIError;
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const imageData = data.data?.[0];
  if (!imageData?.b64_json && !imageData?.url) {
    const err = new Error('No image data in OpenAI response') as OpenAIError;
    err.status = 500;
    throw err;
  }
  return imageData;
}

/**
 * Turn any caught error into a NextResponse-friendly shape with the right
 * HTTP status. Our error handler pattern is the same in every route —
 * this helper keeps it tight.
 */
export function openAIErrorResponse(err: unknown): { body: { error: string }; status: number } {
  if (
    err &&
    typeof err === 'object' &&
    'status' in err &&
    typeof (err as { status: unknown }).status === 'number'
  ) {
    const e = err as { message?: unknown; status: number };
    return {
      body: { error: typeof e.message === 'string' ? e.message : 'Request failed' },
      status: e.status,
    };
  }
  return {
    body: { error: err instanceof Error ? err.message : 'Request failed' },
    status: 500,
  };
}
