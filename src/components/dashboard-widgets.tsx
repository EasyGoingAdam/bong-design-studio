'use client';

import { useEffect, useMemo, useState } from 'react';
import { HOLIDAY_EVENTS } from '@/lib/holiday-events';
import {
  WINDOW_DAYS,
  CalendarMockup,
  mockupKey,
  eventsWithinWindow,
} from '@/lib/calendar-mockups';

interface HealthCheck { ok: boolean; detail?: string }
interface HealthResponse {
  ok: boolean;
  checks?: Record<string, HealthCheck>;
  features?: Record<string, HealthCheck>;
}

function Dot({ ok }: { ok: boolean }) {
  return (
    <span
      className={`shrink-0 w-2 h-2 rounded-full ${ok ? 'bg-green-500' : 'bg-red-500'}`}
      aria-hidden
    />
  );
}

function Row({ label, check }: { label: string; check?: HealthCheck }) {
  if (!check) return null;
  return (
    <div className="flex items-center gap-2 text-xs py-0.5">
      <Dot ok={check.ok} />
      <span className="font-medium text-foreground shrink-0">{label}</span>
      {check.detail && (
        <span className={`truncate ${check.ok ? 'text-muted' : 'text-red-600'}`}>· {check.detail}</span>
      )}
    </div>
  );
}

/**
 * System & Setup card — surfaces infrastructure health for the newer features
 * (storage bucket, size-preset table, calendar-designs table) plus the count of
 * concept images that never made it to storage (data-URI fallbacks that won't
 * persist). Tells the operator exactly which migration / fix is outstanding.
 */
export function SystemSetupCard({ unstoredImages }: { unstoredImages: number }) {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/health')
      // /api/health returns 500 when a CORE check fails, but the body is still
      // the full report — parse it regardless of status.
      .then((r) => r.json())
      .then((data: HealthResponse) => { if (!cancelled) setHealth(data); })
      .catch(() => { if (!cancelled) setFailed(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const features = health?.features;
  const checks = health?.checks;

  // Count outstanding setup items so a healthy system collapses to one line.
  const issues = useMemo(() => {
    const list: string[] = [];
    if (features) for (const c of Object.values(features)) if (!c.ok) list.push('');
    if (checks) for (const c of Object.values(checks)) if (!c.ok) list.push('');
    if (unstoredImages > 0) list.push('');
    return list.length;
  }, [features, checks, unstoredImages]);

  const allGood = !loading && !failed && issues === 0;

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">System &amp; Setup</h3>
        {loading ? (
          <span className="text-[10px] text-muted">checking…</span>
        ) : allGood ? (
          <span className="text-[10px] text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">All healthy</span>
        ) : (
          <span className="text-[10px] text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded-full">
            {issues} to address
          </span>
        )}
      </div>

      {failed && (
        <p className="text-xs text-red-600">Couldn&apos;t reach the health endpoint.</p>
      )}

      {!failed && (
        <div className="space-y-2">
          {/* Feature infrastructure (new features + migrations) */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Features</div>
            <Row label="Image bucket public" check={features?.bucketPublic} />
            <Row label="Size presets table" check={features?.coilSizes} />
            <Row label="Calendar designs table" check={features?.calendarMockups} />
          </div>

          {/* Core services */}
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1">Core</div>
            <Row label="Database" check={checks?.database} />
            <Row label="Storage read/write" check={checks?.storage} />
            <Row label="Image processing" check={checks?.sharp} />
          </div>

          {/* Client-computed: images stored as data URIs won't survive refresh */}
          {unstoredImages > 0 && (
            <div className="flex items-center gap-2 text-xs py-0.5">
              <Dot ok={false} />
              <span className="font-medium text-foreground shrink-0">Unsaved images</span>
              <span className="truncate text-red-600">
                · {unstoredImages} image{unstoredImages === 1 ? '' : 's'} stored as data URIs — regenerate once storage is healthy
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Upcoming Holiday Drops — the next events within the auto-generation window,
 * with their auto-generated coil design (when one exists yet).
 */
export function UpcomingDropsCard() {
  const [mockups, setMockups] = useState<Map<string, CalendarMockup>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch('/api/calendar/mockups')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: CalendarMockup[]) => {
        if (cancelled) return;
        const m = new Map<string, CalendarMockup>();
        for (const row of Array.isArray(rows) ? rows : []) m.set(mockupKey(row.eventId, row.occurrenceYear), row);
        setMockups(m);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const upcoming = useMemo(() => eventsWithinWindow(HOLIDAY_EVENTS).slice(0, 6), []);

  return (
    <div className="bg-surface border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Upcoming Holiday Drops</h3>
        <button
          type="button"
          onClick={() => { window.location.href = '/?tab=calendar'; }}
          className="text-xs text-accent hover:underline"
        >
          View calendar →
        </button>
      </div>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted py-4 text-center">Nothing within the next {WINDOW_DAYS} days.</p>
      ) : (
        <div className="space-y-1.5">
          {upcoming.map(({ event, occurrence, days }) => {
            const mock = mockups.get(mockupKey(event.id, occurrence.getFullYear()));
            const ready = mock?.status === 'ready' && mock.imageUrl;
            return (
              <button
                type="button"
                key={event.id}
                onClick={() => { window.location.href = '/?tab=calendar'; }}
                className="w-full flex items-center gap-3 p-1.5 rounded-lg hover:bg-background transition-colors text-left"
              >
                <div className="w-10 h-10 rounded bg-white border border-border overflow-hidden shrink-0 flex items-center justify-center">
                  {ready ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={mock!.imageUrl} alt="" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-base">{event.emoji || '◷'}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{event.name}</div>
                  <div className="text-[10px] text-muted">
                    {days === 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`}
                    {ready ? ' · design ready' : ' · design pending'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
