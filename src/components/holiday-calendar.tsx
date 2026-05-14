'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  HOLIDAY_EVENTS,
  HolidayCategory,
  HolidayEvent,
  CATEGORY_META,
  daysUntil,
  nextOccurrence,
  dateInYear,
  eventsRollingYear,
  eventsForYear,
} from '@/lib/holiday-events';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

const ALERTS_KEY = 'holiday-alerts-v1';
const LEAD_DAYS_KEY = 'holiday-alert-lead-days-v1';
const DISMISSED_KEY = 'holiday-alert-dismissed-v1';

const DEFAULT_LEAD_DAYS = 21;
const LEAD_DAYS_PRESETS = [7, 14, 21, 30, 60, 90];

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ALL_CATEGORIES: (HolidayCategory | 'all')[] = [
  'all', 'cannabis', 'major', 'cultural', 'pet', 'food', 'awareness', 'fun', 'seasonal', 'music',
];

/* ───────────── localStorage I/O ───────────── */

function loadAlerts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ALERTS_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function saveAlerts(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ALERTS_KEY, JSON.stringify([...set])); } catch {}
}

function loadLeadDays(): number {
  if (typeof window === 'undefined') return DEFAULT_LEAD_DAYS;
  try {
    const raw = window.localStorage.getItem(LEAD_DAYS_KEY);
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) && parsed > 0 && parsed <= 365 ? parsed : DEFAULT_LEAD_DAYS;
  } catch { return DEFAULT_LEAD_DAYS; }
}
function saveLeadDays(n: number): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(LEAD_DAYS_KEY, String(n)); } catch {}
}

/**
 * Dismissed alerts are keyed by `<eventId>:<yearOfOccurrence>` so a
 * dismissal applies to THIS year's occurrence but the same holiday
 * re-triggers next year automatically.
 */
function loadDismissed(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function saveDismissed(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(DISMISSED_KEY, JSON.stringify([...set])); } catch {}
}

function dismissKey(eventId: string, occurrenceDate: Date): string {
  return `${eventId}:${occurrenceDate.getFullYear()}`;
}

/* ───────────── Component ───────────── */

export function HolidayCalendar({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { addConcept } = useAppStore();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<Set<string>>(new Set());
  const [leadDays, setLeadDaysState] = useState<number>(DEFAULT_LEAD_DAYS);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const [filter, setFilter] = useState<HolidayCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'rolling' | 'year'>('rolling');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);

  // Hydrate from localStorage AFTER mount (SSR-safe).
  useEffect(() => {
    setAlerts(loadAlerts());
    setLeadDaysState(loadLeadDays());
    setDismissed(loadDismissed());
  }, []);

  /* ───────── Alerts banner — only events the user has alerted on,
                that are within their lead-time, and not dismissed for
                this year's occurrence. ───────── */
  const alertsBanner = useMemo(() => {
    return HOLIDAY_EVENTS
      .filter((e) => alerts.has(e.id))
      .map((event) => {
        const occ = nextOccurrence(event);
        if (!occ) return null;
        const days = daysUntil(event);
        if (days > leadDays || days < 0) return null;
        if (dismissed.has(dismissKey(event.id, occ))) return null;
        return { event, occurrence: occ, days };
      })
      .filter((x): x is { event: HolidayEvent; occurrence: Date; days: number } => x !== null)
      .sort((a, b) => a.days - b.days);
  }, [alerts, leadDays, dismissed]);

  /* ───────── Event list (filtered by view + search + category) ───────── */
  const eventList = useMemo(() => {
    if (view === 'year') {
      return eventsForYear(year).map((x) => ({ event: x.event, date: x.date }));
    }
    return eventsRollingYear().map((e) => ({
      event: e,
      date: nextOccurrence(e) || dateInYear(e, currentYear)!,
    }));
  }, [view, year, currentYear]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eventList.filter(({ event }) => {
      if (filter !== 'all' && event.category !== filter) return false;
      if (q && !`${event.name} ${event.blurb} ${event.designIdeas.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [eventList, filter, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, { event: HolidayEvent; date: Date }[]>();
    for (const item of filtered) {
      const key = `${item.date.getFullYear()}-${item.date.getMonth()}`;
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    for (const [, list] of map) list.sort((a, b) => a.date.getTime() - b.date.getTime());
    return map;
  }, [filtered]);

  /* ───────── Mutations ───────── */

  const toggleAlert = (id: string) => {
    setAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); toast('Alert removed', 'info'); }
      else { next.add(id); toast(`Alert set — banner ${leadDays} days before`, 'success'); }
      saveAlerts(next);
      return next;
    });
  };

  const updateLeadDays = (n: number) => {
    setLeadDaysState(n);
    saveLeadDays(n);
    // Clearing dismissed-set on lead-time change ensures events that
    // suddenly fall back into range aren't silently hidden by a stale
    // dismissal from a tighter window.
    setDismissed(new Set());
    saveDismissed(new Set());
  };

  const dismiss = (eventId: string, occurrence: Date) => {
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(dismissKey(eventId, occurrence));
      saveDismissed(next);
      return next;
    });
  };

  const restoreAllDismissed = () => {
    setDismissed(new Set());
    saveDismissed(new Set());
    toast('Restored dismissed alerts', 'info');
  };

  const createConceptFromEvent = async (e: HolidayEvent) => {
    const occ = nextOccurrence(e);
    if (!occ) { toast('No date available for this event', 'error'); return; }
    const yr = occ.getFullYear();
    const tags = [
      e.category,
      e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      `${yr}`,
    ];
    const description = `${e.blurb}\n\nDesign directions to explore:\n${e.designIdeas.map((d) => `• ${d}`).join('\n')}`;
    try {
      const concept = await addConcept({
        name: `${e.name} ${yr}`,
        description,
        tags,
        lifecycleType: 'limited_edition',
        intendedAudience: 'Holiday gift buyers',
        priority: daysUntil(e) <= 60 ? 'high' : 'medium',
        specs: {
          designStyleName: '', designTheme: e.name,
          patternDensity: 'medium', laserComplexity: 3,
          estimatedEtchingTime: '', surfaceCoverage: 50,
          lineThickness: '', bwContrastGuidance: '',
          symmetryRequirement: 'none', coordinationMode: 'thematic',
          productionFeasibility: 3, riskNotes: '', baseShape: 'circle',
        },
      });
      toast(`Concept created — opening ${concept.name}`, 'success');
      onOpenConcept(concept.id);
    } catch {
      toast('Could not create concept', 'error');
    }
  };

  /* ───────── Rendering ───────── */

  const renderEvent = ({ event, date }: { event: HolidayEvent; date: Date }) => {
    const today = new Date();
    const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const days = Math.round((date.getTime() - todayMs) / 86_400_000);
    const isAlerted = alerts.has(event.id);
    const isImminent = days >= 0 && days <= leadDays;
    const isPast = days < 0;
    const meta = CATEGORY_META[event.category];

    return (
      <div
        key={`${event.id}-${date.getFullYear()}`}
        className={`bg-surface border rounded-lg p-4 transition-colors ${
          isImminent ? 'border-accent' : isPast ? 'border-border opacity-60' : 'border-border hover:border-border-light'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl shrink-0 leading-none mt-1">{event.emoji}</div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <h3 className="font-medium text-sm">{event.name}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}>
                {meta.label}
              </span>
              {isAlerted && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-accent text-white">
                  ◈ alert on
                </span>
              )}
              {event.floating && (
                <span className="text-[10px] px-1.5 py-0.5 rounded text-muted bg-background border border-border" title="Date varies year to year">
                  floating
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-2">
              <span className="mono">{MONTH_NAMES[date.getMonth()]} {date.getDate()}, {date.getFullYear()}</span>
              <span>·</span>
              <span className={isImminent ? 'text-accent font-medium' : ''}>
                {days < 0 ? `${Math.abs(days)} days ago` :
                 days === 0 ? 'today' :
                 days === 1 ? 'tomorrow' :
                 `in ${days} days`}
              </span>
            </div>
            <p className="text-xs text-muted mb-3 leading-relaxed">{event.blurb}</p>
            {event.designIdeas.length > 0 && (
              <details className="text-xs mb-3">
                <summary className="cursor-pointer text-muted hover:text-foreground font-medium">
                  {event.designIdeas.length} design idea{event.designIdeas.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 space-y-1 pl-4 list-disc text-muted">
                  {event.designIdeas.map((idea, i) => <li key={i}>{idea}</li>)}
                </ul>
              </details>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => createConceptFromEvent(event)}
                disabled={isPast}
                className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors font-medium disabled:opacity-50"
              >
                + Create concept
              </button>
              <button
                onClick={() => toggleAlert(event.id)}
                className={`text-xs px-3 py-1.5 rounded-lg transition-colors font-medium border ${
                  isAlerted
                    ? 'bg-accent/10 text-accent border-accent/30'
                    : 'bg-surface text-muted border-border hover:border-border-light'
                }`}
              >
                {isAlerted ? '◈ alert on' : '◇ set alert'}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const yearsAvailable = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      {/* ───────── ALERTS BANNER — sticky to top of page ───────── */}
      {alertsBanner.length > 0 && (
        <div
          className="sticky top-0 z-20 -mx-3 sm:-mx-6 mb-5 border-b border-accent bg-accent/10 px-3 sm:px-6 py-3 backdrop-blur"
          role="alert"
        >
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-accent text-lg" aria-hidden>⚠</span>
              <span className="eyebrow text-accent">
                {alertsBanner.length} alerted event{alertsBanner.length === 1 ? '' : 's'} within {leadDays} days
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] text-muted">Alert me</label>
              <select
                value={LEAD_DAYS_PRESETS.includes(leadDays) ? leadDays : 'custom'}
                onChange={(e) => {
                  if (e.target.value === 'custom') return;
                  updateLeadDays(Number(e.target.value));
                }}
                className="bg-surface border border-border rounded px-2 py-0.5 text-xs focus:outline-none focus:border-foreground"
                aria-label="Alert lead time"
              >
                {LEAD_DAYS_PRESETS.map((d) => (
                  <option key={d} value={d}>{d} days before</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertsBanner.map(({ event, occurrence, days }) => (
              <div
                key={`${event.id}-${occurrence.getFullYear()}`}
                className="inline-flex items-center gap-1.5 pl-3 pr-1 py-1 rounded-full text-xs bg-accent text-white"
                title={event.blurb}
              >
                <span>{event.emoji}</span>
                <span className="font-medium">{event.name}</span>
                <span className="text-white/80">·</span>
                <span className="text-white/80 tabular-nums">
                  {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`}
                </span>
                <button
                  onClick={() => dismiss(event.id, occurrence)}
                  aria-label={`Dismiss ${event.name} alert`}
                  className="ml-1 w-5 h-5 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-[11px] leading-none transition-colors compact"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* When the banner is empty BUT there are dismissed items, surface a
          subtle "restore" link so users aren't stuck if they X'd everything
          and want them back. */}
      {alertsBanner.length === 0 && dismissed.size > 0 && (
        <div className="mb-5 text-xs text-muted flex items-center gap-2">
          <span>You've dismissed {dismissed.size} alert{dismissed.size === 1 ? '' : 's'} this cycle.</span>
          <button onClick={restoreAllDismissed} className="text-accent hover:underline">
            Restore them
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
        <div>
          <div className="eyebrow mb-1">Production Calendar</div>
          <h2 className="display-sm">Holidays &amp; Observances</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            {HOLIDAY_EVENTS.length} curated dates · {alerts.size} on your alert list · banner fires {leadDays} days before
          </p>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
        <div className="flex-1 relative">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search holidays, blurbs, design ideas…"
            className="w-full bg-surface border border-border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-foreground"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted text-sm pointer-events-none">⌕</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border overflow-hidden text-xs">
            <button
              onClick={() => setView('rolling')}
              className={`px-3 py-1.5 ${view === 'rolling' ? 'bg-foreground text-surface' : 'bg-surface hover:bg-surface-hover'}`}
            >
              From today
            </button>
            <button
              onClick={() => setView('year')}
              className={`px-3 py-1.5 border-l border-border ${view === 'year' ? 'bg-foreground text-surface' : 'bg-surface hover:bg-surface-hover'}`}
            >
              By year
            </button>
          </div>
          {view === 'year' && (
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="bg-surface border border-border rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-foreground"
            >
              {yearsAvailable.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Category filter row */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {ALL_CATEGORIES.map((c) => {
          const active = filter === c;
          const label = c === 'all' ? 'All' : CATEGORY_META[c].label;
          return (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                active
                  ? 'bg-foreground text-surface border-foreground'
                  : 'bg-surface text-muted border-border hover:border-border-light'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Event list, grouped by month */}
      {filtered.length === 0 ? (
        <div className="text-center text-sm text-muted py-12">No events match your filters.</div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([key, items]) => {
            const [keyYear, keyMonth] = key.split('-').map(Number);
            return (
              <section key={key}>
                <div className="flex items-baseline gap-3 mb-3 sticky top-[88px] bg-background/95 backdrop-blur-sm py-2 z-10">
                  <h3 className="serif text-xl font-medium">{MONTH_NAMES[keyMonth]}</h3>
                  <span className="eyebrow">{keyYear}</span>
                  <span className="text-xs text-muted">
                    {items.length} event{items.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {items.map(renderEvent)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
