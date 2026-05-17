/**
 * Structured logger — works on both server and client.
 *
 * Output format is a single line per entry, grep-friendly:
 *   [LEVEL] op=foo.bar key1=value1 key2="quoted value" err="msg"
 *
 * Railway captures stdout/stderr automatically; on the client we hit
 * console.{info,warn,error}. Use `withLog` to wrap an API handler and
 * get free entry/exit/duration/error timing.
 *
 * Why not pino / winston / datadog?
 *  - Zero deps, zero config, zero runtime cost. We can swap to a real
 *    transport later (pino has a "transport" mode that reads stdout)
 *    without touching call sites if we keep the format stable.
 */

import type { NextRequest } from 'next/server';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogFields {
  // `unknown` so callers can pass caught errors (typed `unknown` after
  // TS 4.4) without a cast at every site. The `fmt` helper handles
  // Error / object / primitive cases at runtime.
  [key: string]: unknown;
}

/* ────────────── Formatting ────────────── */

/** Render a value as a logfmt-safe token. */
function fmt(v: unknown): string {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (v instanceof Error) {
    // Quote the message + include the first line of the stack for grep
    const msg = v.message.replace(/"/g, '\\"').replace(/\n/g, ' ');
    return `"${msg}"`;
  }
  if (typeof v === 'object') {
    try {
      const s = JSON.stringify(v).replace(/"/g, '\\"');
      return `"${s.length > 500 ? s.slice(0, 500) + '…' : s}"`;
    } catch { return '"[unserializable]"'; }
  }
  const s = String(v);
  // Quote if it has whitespace or special chars; escape inner quotes
  if (/[\s="]/.test(s)) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}

function formatLine(level: LogLevel, op: string, fields: LogFields = {}): string {
  const parts: string[] = [`[${level.toUpperCase()}]`, `op=${op}`];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    parts.push(`${k}=${fmt(v)}`);
  }
  return parts.join(' ');
}

/* ────────────── Core ────────────── */

function emit(level: LogLevel, op: string, fields: LogFields = {}): void {
  const line = formatLine(level, op, fields);
  switch (level) {
    case 'error': console.error(line); break;
    case 'warn':  console.warn(line); break;
    case 'debug': console.debug(line); break;
    default:      console.log(line);
  }
}

export const log = {
  debug: (op: string, f?: LogFields) => emit('debug', op, f),
  info:  (op: string, f?: LogFields) => emit('info',  op, f),
  warn:  (op: string, f?: LogFields) => emit('warn',  op, f),
  error: (op: string, f?: LogFields) => emit('error', op, f),
};

/* ────────────── Request IDs ────────────── */

/**
 * Cheap random ID — 12 hex chars, ~48 bits of entropy. Collision risk in
 * a per-request scope is negligible. NOT cryptographically secure.
 * Use crypto.randomUUID() if we ever need that.
 */
export function newRequestId(): string {
  return Math.random().toString(16).slice(2, 14).padEnd(12, '0');
}

/* ────────────── API handler wrapper ────────────── */

/**
 * Wraps a Next.js route handler with entry/exit/duration/error logging.
 *
 * Usage:
 *   export const GET = withLog('cfp.designs.list', async (req, ctx) => {
 *     ... return NextResponse.json(...);
 *   });
 *
 * Logs:
 *   - on entry:   op="cfp.designs.list" req_id=abc... path=/...
 *   - on success: op="cfp.designs.list" req_id=abc... duration_ms=234 status=200
 *   - on error:   op="cfp.designs.list" req_id=abc... duration_ms=234 err="..."
 *
 * Errors are always re-thrown so the caller's error response stays intact.
 */
type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: Ctx<P>) => Promise<Response>;

export function withLog<P = Record<string, never>>(
  op: string,
  handler: Handler<P>
): Handler<P> {
  return async (req, ctx) => {
    const reqId = newRequestId();
    const start = Date.now();
    const method = req.method;
    const url = new URL(req.url);
    const path = url.pathname;

    log.info(`${op}.start`, { req_id: reqId, method, path });

    try {
      const res = await handler(req, ctx);
      const duration = Date.now() - start;
      const level = res.status >= 500 ? 'error' : res.status >= 400 ? 'warn' : 'info';
      log[level](`${op}.end`, {
        req_id: reqId, method, status: res.status, duration_ms: duration,
      });
      // Attach the request id to the response so clients can correlate
      // when something goes sideways and they paste a screenshot.
      try { res.headers.set('x-request-id', reqId); } catch { /* immutable response */ }
      return res;
    } catch (err) {
      const duration = Date.now() - start;
      log.error(`${op}.error`, {
        req_id: reqId, method, duration_ms: duration, err,
      });
      throw err;
    }
  };
}

/* ────────────── Timer helper ────────────── */

/** Returns elapsed milliseconds since the timer started. */
export function timer(): () => number {
  const start = Date.now();
  return () => Date.now() - start;
}
