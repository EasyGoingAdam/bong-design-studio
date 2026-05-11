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
  upcomingEvents,
  eventsRollingYear,
  eventsForYear,
} from '@/lib/holiday-events';
import { useAppStore } from '@/lib/store';
import { useToast } from './toast';

const ALERT_STORAGE_KEY = 'holiday-alerts-v1';
const ALERT_LEAD_DAYS = 21;

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const ALL_CATEGORIES: (HolidayCategory | 'all')[] = [
  'all', 'cannabis', 'major', 'cultural', 'pet', 'food', 'awareness', 'fun', 'seasonal', 'music',
];

function loadAlerts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch { return new Set(); }
}
function saveAlerts(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([...set])); } catch {}
}

export function HolidayCalendar({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { addConcept } = useAppStore();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<HolidayCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  // 'rolling' = chronological from today; 'year' = pick a specific calendar year
  const [view, setView] = useState<'rolling' | 'year'>('rolling');
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<number>(currentYear);
  const [showSubscribe, setShowSubscribe] = useState(false);

  useEffect(() => { setAlerts(loadAlerts()); }, []);

  const upcoming = useMemo(() => upcomingEvents(ALERT_LEAD_DAYS), []);

  // Active event list depending on view
  const eventList = useMemo(() => {
    if (view === 'year') {
      return eventsForYear(year).map((x) => ({ event: x.event, date: x.date }));
    }
    return eventsRollingYear().map((e) => ({ event: e, date: nextOccurrence(e) || dateInYear(e, currentYear)! }));
  }, [view, year, currentYear]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return eventList.filter(({ event }) => {
      if (filter !== 'all' && event.category !== filter) return false;
      if (q && !`${event.name} ${event.blurb} ${event.designIdeas.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [eventList, filter, search]);

  // Group by month
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

  const toggleAlert = (id: string) => {
    setAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); toast('Alert removed', 'info'); }
      else { next.add(id); toast(`Alert set — banner ${ALERT_LEAD_DAYS} days before`, 'success'); }
      saveAlerts(next);
      return next;
    });
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

  /**
   * Download a single-event .ics file the user can drag into their
   * Calendar app or attach to a Slack message.
   */
  const downloadEventIcs = (e: HolidayEvent) => {
    const occ = nextOccurrence(e);
    if (!occ) return;
    const yr = occ.getFullYear();
    window.location.href = `/api/calendar?year=${yr}&category=${e.category}#${e.id}`;
  };

  const downloadFullIcs = () => {
    const params = new URLSearchParams();
    if (view === 'year') params.set('year', String(year));
    if (filter !== 'all') params.set('category', filter);
    window.location.href = `/api/calendar?${params.toString()}`;
  };

  const renderEvent = ({ event, date }: { event: HolidayEvent; date: Date }) => {
    const today = new Date();
    const days = Math.round((date.getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86_400_000);
    const isAlerted = alerts.has(event.id);
    const isImminent = days >= 0 && days <= ALERT_LEAD_DAYS;
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
              <span className={isImminent ? 'text-accent font-medium' : isPast ? '' : ''}>
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
              <button
                onClick={() => downloadEventIcs(event)}
                className="text-xs px-3 py-1.5 rounded-lg text-muted border border-border hover:border-border-light"
                title="Download .ics — add to Google/Apple Calendar"
              >
                ↓ ics
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const alertedUpcoming = upcoming.filter((e) => alerts.has(e.id));
  const yearsAvailable = [currentYear - 1, currentYear, currentYear + 1, currentYear + 2, currentYear + 3];

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3 mb-5">
        <div>
          <div className="eyebrow mb-1">Production Calendar</div>
          <h2 className="display-sm">Holidays &amp; Observances</h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            {HOLIDAY_EVENTS.length} curated dates · plan limited-edition pieces · {ALERT_LEAD_DAYS}-day alerts
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setShowSubscribe(true)}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg hover:border-border-light"
            title="Subscribe via URL in Google Calendar / Apple Calendar"
          >
            ⤡ Subscribe
          </button>
          <button
            onClick={downloadFullIcs}
            className="px-3 py-1.5 text-sm bg-foreground text-surface rounded-lg hover:bg-accent"
            title="Download .ics file for current filter"
          >
            ↓ Export .ics
          </button>
        </div>
      </div>

      {/* IMMINENT BANNER */}
      {upcoming.length > 0 && (
        <div className="mb-5 border border-accent bg-accent/5 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-accent text-lg">⚠</span>
            <span className="eyebrow text-accent">
              {upcoming.length} event{upcoming.length === 1 ? '' : 's'} within {ALERT_LEAD_DAYS} days
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {upcoming.map((e) => {
              const days = daysUntil(e);
              const isAlerted = alerts.has(e.id);
              return (
                <div
                  key={e.id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs border ${
                    isAlerted ? 'bg-accent text-white border-accent' : 'bg-surface border-accent/30'
                  }`}
                  title={e.blurb}
                >
                  <span>{e.emoji}</span>
                  <span className="font-medium">{e.name}</span>
                  <span className={isAlerted ? 'text-white/80' : 'text-muted'}>
                    · {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
          {alertedUpcoming.length > 0 && (
            <div className="mt-3 pt-3 border-t border-accent/20 text-xs text-muted">
              {alertedUpcoming.length} of these {alertedUpcoming.length === 1 ? 'is' : 'are'} flagged with an alert.
            </div>
          )}
        </div>
      )}

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
                <div className="flex items-baseline gap-3 mb-3 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
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

      {/* Subscribe modal */}
      {showSubscribe && (
        <SubscribeModal onClose={() => setShowSubscribe(false)} year={view === 'year' ? year : null} category={filter} />
      )}
    </div>
  );
}

/* ───────────── Subscribe modal ───────────── */

function SubscribeModal({
  onClose, year, category,
}: { onClose: () => void; year: number | null; category: HolidayCategory | 'all' }) {
  const { toast } = useToast();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const params = new URLSearchParams();
  if (year) params.set('year', String(year));
  if (category !== 'all') params.set('category', category);
  const subscribeUrl = `${baseUrl}/api/calendar${params.toString() ? '?' + params.toString() : ''}`;
  const webcalUrl = subscribeUrl.replace(/^https?:\/\//, 'webcal://');

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${label} copied`, 'success');
    } catch {
      prompt('Copy this URL:', text);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 modal-backdrop z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-border rounded-xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-surface border-b border-border px-5 py-3 flex items-center justify-between">
          <div>
            <div className="eyebrow">Calendar Subscription</div>
            <h2 className="serif text-xl font-medium">Live calendar feed</h2>
          </div>
          <button onClick={onClose} className="text-muted hover:text-foreground text-xl leading-none">×</button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-sm text-muted">
            Subscribe to keep these holidays in your everyday calendar. The feed auto-refreshes every 12 hours,
            so when we add new dates here they appear in your calendar too.
          </p>

          <div className="bg-background border border-border rounded-lg p-4">
            <div className="eyebrow mb-2">Apple Calendar / Outlook</div>
            <div className="flex gap-2 items-center mb-1">
              <code className="mono text-[11px] flex-1 truncate text-foreground">{webcalUrl}</code>
              <button
                onClick={() => copy(webcalUrl, 'webcal:// URL')}
                className="text-xs px-2.5 py-1 bg-surface border border-border rounded hover:border-foreground"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-muted">
              Tap on iOS to subscribe directly, or paste in Calendar → File → New Calendar Subscription.
            </p>
          </div>

          <div className="bg-background border border-border rounded-lg p-4">
            <div className="eyebrow mb-2">Google Calendar</div>
            <div className="flex gap-2 items-center mb-1">
              <code className="mono text-[11px] flex-1 truncate text-foreground">{subscribeUrl}</code>
              <button
                onClick={() => copy(subscribeUrl, 'https URL')}
                className="text-xs px-2.5 py-1 bg-surface border border-border rounded hover:border-foreground"
              >
                Copy
              </button>
            </div>
            <p className="text-[10px] text-muted">
              In Google Calendar: Other calendars → + → From URL → paste this. May take up to 24 hours for first sync.
            </p>
          </div>

          <div className="bg-background border border-border rounded-lg p-4">
            <div className="eyebrow mb-2">One-time download</div>
            <a
              href={subscribeUrl}
              download
              className="inline-block text-xs px-3 py-1.5 bg-foreground text-surface rounded-lg hover:bg-accent"
            >
              ↓ Download .ics
            </a>
            <p className="text-[10px] text-muted mt-2">
              A single .ics file you can import once. Won't auto-update — use the subscription URLs above for that.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
