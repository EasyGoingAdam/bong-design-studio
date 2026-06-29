import { supabase } from './supabase';

/**
 * Installs a one-time global fetch wrapper that attaches the current Supabase
 * access token as a Bearer header to same-origin /api requests. This lets the
 * server-side proxy authenticate every API call without having to thread
 * a header through dozens of existing fetch() call sites.
 *
 * Safe by construction: only relative "/api/..." (or same-origin /api) string
 * URLs are touched; Supabase's own absolute calls and any third-party fetch
 * pass through untouched. On any error or missing session it falls through to
 * the original fetch (the request still runs; the server may 401).
 */
export function installAuthFetch() {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { __authFetchInstalled?: boolean };
  if (w.__authFetchInstalled) return;
  w.__authFetchInstalled = true;

  const orig = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      const url =
        typeof input === 'string' ? input
        : input instanceof URL ? input.toString()
        : input instanceof Request ? input.url
        : String(input);

      const sameOriginApi =
        url.startsWith('/api/') || url.startsWith(`${window.location.origin}/api/`);

      if (sameOriginApi) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          if (input instanceof Request) {
            const headers = new Headers(input.headers);
            if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
            return orig(new Request(input, { headers }));
          }
          const headers = new Headers(init?.headers || undefined);
          if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
          return orig(url, { ...init, headers });
        }
      }
    } catch {
      // fall through to the unmodified request
    }
    return orig(input as RequestInfo | URL, init);
  };
}
