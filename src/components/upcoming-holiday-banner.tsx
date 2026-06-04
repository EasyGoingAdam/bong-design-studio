'use client';

import { useEffect, useState } from 'react';
import { upcomingEvents, HolidayEvent, daysUntil, CATEGORY_META } from '@/lib/holiday-events';

/**
 * Site-wide upcoming-holiday banner. Renders at the top of every page
 * via the AppShell, showing the soonest holiday on the calendar so the
 * team has it top-of-mind when they open the studio.
 *
 * Behavior:
 *  - Hides itself if no event is within 60 days (avoid permanent banner
 *    noise when nothing relevant is coming up).
 *  - Dismiss button (×) hides the banner for the rest of the day for
 *    the EVENT in question — the next day, OR when a new closer event
 *    appears, it shows again. Per-event dismissal so closing one
 *    holiday doesn't silence the next.
 *  - Storage key is per-event + per-day so the SAME holiday doesn't
 *    nag every page load, but DIFFERENT holidays still get surfaced.
 */

const LOOKAHEAD_DAYS = 60;
const DISMISS_STORAGE_KEY = 'holiday-banner-dismissed-v1';
const ONE_DAY_MS = 86_400_000;

interface DismissRecord {
  eventId: string;
  // ISO date (YYYY-MM-DD) the user dismissed THIS event. Re-shows the
  // next day so the team stays aware.
  dismissedDate: string;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function loadDismissed(): DismissRecord | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.eventId !== 'string' || typeof parsed?.dismissedDate !== 'string') return null;
    return parsed as DismissRecord;
  } catch { return null; }
}

function saveDismissed(rec: DismissRecord): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DISMISS_STORAGE_KEY, JSON.stringify(rec)); } catch {}
}

export function UpcomingHolidayBanner() {
  const [hidden, setHidden] = useState(true);
  const [event, setEvent] = useState<HolidayEvent | null>(null);

  // Resolve on mount + once per minute so a long-lived tab eventually
  // rolls forward when the clock crosses midnight or an event passes.
  useEffect(() => {
    const resolve = () => {
      // BUG FIX: wrap in try/catch — without this, a malformed entry
      // anywhere in HOLIDAY_EVENTS (bad floating-date lookup, etc.)
      // would throw out of this effect and tear the whole AppShell
      // down with it. Banner should fail closed (hide), not crash.
      try {
        const upcoming = upcomingEvents(LOOKAHEAD_DAYS);
        const next = upcoming[0] ?? null;
        if (!next) {
          setEvent(null);
          setHidden(true);
          return;
        }
        setEvent(next);

        const dismiss = loadDismissed();
        const today = todayIso();
        // Hide if this specific event was dismissed TODAY. Different
        // event or different day → still show.
        const shouldHide =
          dismiss?.eventId === next.id && dismiss?.dismissedDate === today;
        setHidden(shouldHide);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn('[upcoming-holiday-banner] resolve failed:', err);
        setEvent(null);
        setHidden(true);
      }
    };
    resolve();
    const id = setInterval(resolve, 60_000);
    return () => clearInterval(id);
  }, []);

  if (hidden || !event) return null;

  const days = daysUntil(event);
  const meta = CATEGORY_META[event.category];

  const dismiss = () => {
    if (event) {
      saveDismissed({ eventId: event.id, dismissedDate: todayIso() });
    }
    setHidden(true);
  };

  const daysLabel =
    days < 0 ? 'today' : // shouldn't happen via upcomingEvents but defensive
    days === 0 ? 'today' :
    days === 1 ? 'tomorrow' :
    `in ${days} days`;

  return (
    <div
      className={`relative shrink-0 border-b border-accent/30 bg-accent/5 px-3 sm:px-6 py-2 text-xs flex items-center gap-2 ${meta.cls}`}
      role="region"
      aria-label="Upcoming holiday notification"
    >
      <span className="text-base shrink-0" aria-hidden>{event.emoji}</span>
      <div className="flex-1 min-w-0 leading-tight">
        <span className="font-semibold">Next up: {event.name}</span>
        <span className="opacity-70"> — {daysLabel}</span>
        {event.blurb && (
          <span className="hidden sm:inline opacity-60"> · {event.blurb}</span>
        )}
      </div>
      <a
        href="/calendar"
        className="hidden sm:inline-block text-[11px] underline hover:opacity-80 shrink-0"
      >
        Open calendar →
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss notification"
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-foreground/10 shrink-0"
        title="Hide until tomorrow"
      >
        ×
      </button>
    </div>
  );
}
// Re-export for tests / dev tools that need to clear the dismissed state.
export { ONE_DAY_MS };
