/**
 * Server-side helper for talking to the external Customize Freeze Pipe API.
 * The API key (cfp_live_…) MUST live in CFP_API_KEY env var — never ship
 * it to the browser.
 *
 * Every upstream call is logged with timing + status so a slow or flaky
 * upstream shows up in Railway logs without any per-call boilerplate.
 *
 * Env vars:
 *   CFP_API_KEY=cfp_live_<your-key>             (required)
 *   CFP_API_BASE=https://...                    (optional override)
 */

import { log, timer } from './log';

const DEFAULT_BASE = 'https://customize-freezepipe-production.up.railway.app/api/external';

export function getCfpConfig(): { base: string; apiKey: string } | null {
  const apiKey = process.env.CFP_API_KEY;
  if (!apiKey) return null;
  const base = process.env.CFP_API_BASE || DEFAULT_BASE;
  return { base, apiKey };
}

/**
 * Authenticated fetch to the CFP upstream. Logs every call with duration
 * + status. Body content is NOT logged (privacy + size).
 */
export async function cfpFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const cfg = getCfpConfig();
  if (!cfg) {
    log.error('cfp.fetch.unconfigured', { path });
    throw new Error('CFP_API_KEY not configured');
  }

  const elapsed = timer();
  const method = init.method || 'GET';

  try {
    const res = await fetch(`${cfg.base}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      // Disable Next.js fetch cache — we want fresh on every call.
      cache: 'no-store',
    });

    const duration_ms = elapsed();
    const level = res.status >= 500 ? 'error'
                : res.status >= 400 ? 'warn'
                : 'info';
    log[level]('cfp.fetch', {
      method, path, status: res.status, duration_ms,
    });
    return res;
  } catch (err) {
    log.error('cfp.fetch.network', {
      method, path, duration_ms: elapsed(), err,
    });
    throw err;
  }
}
