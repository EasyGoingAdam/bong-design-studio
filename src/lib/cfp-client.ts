/**
 * Server-side helper for talking to the external Customize Freeze Pipe API.
 * The API key (cfp_live_…) MUST live in CFP_API_KEY env var — never ship it
 * to the browser.
 *
 * Add to Railway:
 *   CFP_API_KEY=cfp_live_<your-key>
 *   CFP_API_BASE=https://customize-freezepipe-production.up.railway.app/api/external  (optional override)
 */

const DEFAULT_BASE = 'https://customize-freezepipe-production.up.railway.app/api/external';

export function getCfpConfig(): { base: string; apiKey: string } | null {
  const apiKey = process.env.CFP_API_KEY;
  if (!apiKey) return null;
  const base = process.env.CFP_API_BASE || DEFAULT_BASE;
  return { base, apiKey };
}

export async function cfpFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const cfg = getCfpConfig();
  if (!cfg) throw new Error('CFP_API_KEY not configured');

  return fetch(`${cfg.base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    // Disable Next.js fetch cache for live data — we want fresh on every call.
    cache: 'no-store',
  });
}
