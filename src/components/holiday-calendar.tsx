'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  HOLIDAY_EVENTS,
  HolidayCategory,
  HolidayEvent,
  CATEGORY_META,
  daysUntil,
  nextOccurrence,
  upcomingEvents,
  eventsRollingYear,
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
  'all', 'cannabis', 'major', 'cultural', 'pet', 'food', 'awareness', 'fun', 'seasonal',
];

/**
 * Read the user's alerted-event set from localStorage. Returns an empty
 * Set if storage is unavailable (SSR, private mode, etc).
 */
function loadAlerts(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.localStorage.getItem(ALERT_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveAlerts(set: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(ALERT_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    /* quota / private mode — silent */
  }
}

export function HolidayCalendar({ onOpenConcept }: { onOpenConcept: (id: string) => void }) {
  const { addConcept } = useAppStore();
  const { toast } = useToast();

  const [alerts, setAlerts] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<HolidayCategory | 'all'>('all');
  const [search, setSearch] = useState('');
  // View mode: 'rolling' (next 12 months from today) or 'calendar' (Jan-Dec)
  const [view, setView] = useState<'rolling' | 'calendar'>('rolling');

  // Hydrate alerts from localStorage AFTER mount (SSR-safe)
  useEffect(() => {
    setAlerts(loadAlerts());
  }, []);

  const upcoming = useMemo(() => upcomingEvents(ALERT_LEAD_DAYS), []);

  const filteredEvents = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = view === 'rolling' ? eventsRollingYear() : HOLIDAY_EVENTS;
    return base.filter((e) => {
      if (filter !== 'all' && e.category !== filter) return false;
      if (q && !`${e.name} ${e.blurb} ${e.designIdeas.join(' ')}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [filter, search, view]);

  // For calendar view, group by month. For rolling view, group by month-of-occurrence.
  const grouped = useMemo(() => {
    const map = new Map<string, HolidayEvent[]>();
    for (const e of filteredEvents) {
      const occ = nextOccurrence(e);
      const key = view === 'rolling'
        ? `${occ.getFullYear()}-${occ.getMonth()}`
        : `0-${e.month - 1}`;
      const list = map.get(key) || [];
      list.push(e);
      map.set(key, list);
    }
    // For each month bucket, sort by day
    for (const [, list] of map) {
      list.sort((a, b) => a.month === b.month ? a.day - b.day : a.month - b.month);
    }
    return map;
  }, [filteredEvents, view]);

  const toggleAlert = (id: string) => {
    setAlerts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        toast('Alert removed', 'info');
      } else {
        next.add(id);
        toast(`Alert set — you&rsquo;ll see this banner ${ALERT_LEAD_DAYS} days before`, 'success');
      }
      saveAlerts(next);
      return next;
    });
  };

  const createConceptFromEvent = async (e: HolidayEvent) => {
    const occ = nextOccurrence(e);
    const year = occ.getFullYear();
    const tags = [
      e.category,
      e.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
      `${year}`,
    ];
    const description = `${e.blurb}\n\nDesign directions to explore:\n${e.designIdeas.map((d) => `• ${d}`).join('\n')}`;
    try {
      const concept = await addConcept({
        name: `${e.name} ${year}`,
        description,
        tags,
        lifecycleType: 'limited_edition',
        intendedAudience: 'Holiday gift buyers',
        priority: daysUntil(e) <= 60 ? 'high' : 'medium',
        specs: {
          designStyleName: '',
          designTheme: e.name,
          patternDensity: 'medium',
          laserComplexity: 3,
          estimatedEtchingTime: '',
          surfaceCoverage: 50,
          lineThickness: '',
          bwContrastGuidance: '',
          symmetryRequirement: 'none',
          coordinationMode: 'thematic',
          productionFeasibility: 3,
          riskNotes: '',
          baseShape: 'circle',
        },
      });
      toast(`Concept created — opening ${concept.name}`, 'success');
      onOpenConcept(concept.id);
    } catch {
      toast('Could not create concept', 'error');
    }
  };

  const renderEvent = (e: HolidayEvent) => {
    const days = daysUntil(e);
    const occ = nextOccurrence(e);
    const isAlerted = alerts.has(e.id);
    const isImminent = days <= ALERT_LEAD_DAYS;
    const meta = CATEGORY_META[e.category];

    return (
      <div
        key={e.id}
        className={`bg-surface border rounded-lg p-4 transition-colors ${
          isImminent ? 'border-accent' : 'border-border hover:border-border-light'
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="text-3xl shrink-0 leading-none mt-1">{e.emoji}</div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-baseline gap-2 mb-1">
              <h3 className="font-medium text-sm">{e.name}</h3>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${meta.cls}`}>
                {meta.label}
              </span>
              {isAlerted && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-accent text-white">
                  ◈ alert on
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 text-xs text-muted mb-2">
              <span className="mono">{MONTH_NAMES[occ.getMonth()]} {occ.getDate()}, {occ.getFullYear()}</span>
              <span>·</span>
              <span className={isImminent ? 'text-accent font-medium' : ''}>
                {days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`}
              </span>
            </div>

            <p className="text-xs text-muted mb-3 leading-relaxed">{e.blurb}</p>

            {e.designIdeas.length > 0 && (
              <details className="text-xs mb-3">
                <summary className="cursor-pointer text-muted hover:text-foreground font-medium">
                  {e.designIdeas.length} design idea{e.designIdeas.length === 1 ? '' : 's'}
                </summary>
                <ul className="mt-2 space-y-1 pl-4 list-disc text-muted">
                  {e.designIdeas.map((idea, i) => <li key={i}>{idea}</li>)}
                </ul>
              </details>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => createConceptFromEvent(e)}
                className="text-xs px-3 py-1.5 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors font-medium"
              >
                + Create concept
              </button>
              <button
                onClick={() => toggleAlert(e.id)}
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

  const alertedUpcoming = upcoming.filter((e) => alerts.has(e.id));

  return (
    <div className="p-3 sm:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="eyebrow mb-1">Production Calendar</div>
        <h2 className="display-sm">Holidays &amp; Observances</h2>
        <p className="text-xs sm:text-sm text-muted mt-1">
          Plan limited-edition pieces around upcoming dates. Set alerts to see banners {ALERT_LEAD_DAYS} days out.
        </p>
      </div>

      {/* IMMINENT BANNER — always shown if anything is within 21 days */}
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
              onClick={() => setView('calendar')}
              className={`px-3 py-1.5 border-l border-border ${view === 'calendar' ? 'bg-foreground text-surface' : 'bg-surface hover:bg-surface-hover'}`}
            >
              Jan – Dec
            </button>
          </div>
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
      {filteredEvents.length === 0 ? (
        <div className="text-center text-sm text-muted py-12">No events match your filters.</div>
      ) : (
        <div className="space-y-6">
          {[...grouped.entries()].map(([key, events]) => {
            const monthIdx = view === 'rolling' ? Number(key.split('-')[1]) : Number(key.split('-')[1]);
            const year = view === 'rolling' ? Number(key.split('-')[0]) : null;
            return (
              <section key={key}>
                <div className="flex items-baseline gap-3 mb-3 sticky top-0 bg-background/95 backdrop-blur-sm py-2 z-10">
                  <h3 className="serif text-xl font-medium">
                    {MONTH_NAMES[monthIdx]}
                  </h3>
                  {year !== null && (
                    <span className="eyebrow">{year}</span>
                  )}
                  <span className="text-xs text-muted">
                    {events.length} event{events.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {events.map(renderEvent)}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
