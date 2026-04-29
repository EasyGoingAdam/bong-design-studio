/**
 * Defensive client-side fetch helpers.
 *
 * Why this exists: when a Next.js API route crashes, the default error
 * response is an HTML page — not JSON. Calling `await res.json()` on that
 * HTML body throws "Failed to execute 'json' on Response: Unexpected token
 * '<'..." which bubbles up as an unhandled promise rejection and can hide
 * the entire UI behind a blank screen.
 *
 * `safeJsonResponse` reads the body as text first, then tries JSON.parse.
 * On failure it returns `{ error }` so callers can surface the issue
 * cleanly instead of crashing.
 */

export interface SafeJsonResult {
  /** When the body wasn't JSON, this is filled. */
  error?: string;
  /** Diagnostic — what kind of body did the server actually return? */
  _bodyType?: 'json' | 'html' | 'text' | 'empty';
  /** Allow any other shape — callers cast to their expected type. */
  [key: string]: unknown;
}

/**
 * Read a Response body as JSON without throwing on non-JSON payloads.
 * Always returns an object — success values are spread, failures populate
 * `error` with a human-readable diagnostic.
 */
export async function safeJsonResponse(res: Response): Promise<SafeJsonResult> {
  let text = '';
  try {
    text = await res.text();
  } catch {
    return {
      error: `Could not read response body (status ${res.status})`,
      _bodyType: 'empty',
    };
  }
  if (!text || text.trim().length === 0) {
    return {
      error: res.ok ? 'Empty response body' : `Empty response (status ${res.status})`,
      _bodyType: 'empty',
    };
  }
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { ...parsed, _bodyType: 'json' };
    }
    // Arrays or primitives — wrap so we still return an object, with the
    // value under a special key.
    return { _value: parsed, _bodyType: 'json' };
  } catch {
    const looksLikeHtml = text.trim().startsWith('<');
    return {
      error: looksLikeHtml
        ? `Server returned an HTML error page (status ${res.status}). Check server logs.`
        : `Server returned non-JSON body (status ${res.status}): ${text.slice(0, 120)}`,
      _bodyType: looksLikeHtml ? 'html' : 'text',
    };
  }
}

/**
 * Variant for endpoints that return arrays (like /api/concepts). Reads
 * safely and returns either the array or a fallback.
 */
export async function safeJsonArray<T = unknown>(res: Response, fallback: T[] = []): Promise<T[]> {
  try {
    const text = await res.text();
    if (!text) return fallback;
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}
