import { NextRequest, NextResponse } from 'next/server';

/**
 * API auth gate. The app's UI is behind Supabase login, but the API routes
 * themselves were unauthenticated — anyone with the URL could read secrets
 * (/api/settings), customer PII (/api/production/jobs), or delete data. This
 * proxy validates the caller's Supabase access token on every /api
 * request, except a small allowlist of endpoints that intentionally serve
 * unauthenticated callers (and enforce their own auth):
 *   - /api/health            liveness probe
 *   - /api/preview/*         public share-link preview page
 *   - /api/incoming/*        external submissions (own API key)
 *   - /api/webhooks/*        external webhooks (HMAC)
 *
 * The browser attaches the token via the global fetch wrapper (auth-fetch.ts).
 */

const PUBLIC_PREFIXES = ['/api/health', '/api/preview', '/api/incoming', '/api/webhooks'];

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

const unauthorized = () =>
  NextResponse.json({ error: 'Unauthorized — sign in to use this API.' }, { status: 401 });

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token) return unauthorized();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    // Misconfigured — fail closed rather than silently allow.
    return NextResponse.json({ error: 'Auth not configured' }, { status: 500 });
  }

  try {
    // Validate the JWT against GoTrue. 200 = a real, unexpired session.
    const res = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
      // Don't let a slow auth call hang the request forever.
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return unauthorized();
  } catch {
    return unauthorized();
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*',
};
