/**
 * Calendar auto-mockups — shared (client + server safe) helpers.
 *
 * Each holiday event gets ONE usable coil-design image per year's occurrence,
 * auto-generated once the event is within WINDOW_DAYS. This module holds the
 * pieces both the browser and the server need: the window constant, the row
 * type, the coil-prompt builder, and "which events are in range" logic.
 *
 * Server-only concerns (OpenAI calls, storage upload, DB writes) live in
 * calendar-mockups-server.ts.
 */

import { HolidayEvent, nextOccurrence, daysUntil } from './holiday-events';
import { ENGRAVING_RULES } from './prompt-builder';

/** Generate a mockup once an event is this many days out (or closer). */
export const WINDOW_DAYS = 30;

/** One stored coil mockup (camelCase view of the calendar_mockups row). */
export interface CalendarMockup {
  id: string;
  eventId: string;
  eventName: string;
  occurrenceYear: number;
  occurrenceDate: string | null;
  imageUrl: string;
  prompt: string;
  status: 'ready' | 'failed';
  error?: string | null;
  kept: boolean;
  regenCount: number;
  model?: string | null;
  provider?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Key a mockup by event + occurrence year (matches the DB unique index). */
export function mockupKey(eventId: string, occurrenceYear: number): string {
  return `${eventId}:${occurrenceYear}`;
}

/**
 * Build the laser-etch coil prompt for an event. `regenCount` rotates the
 * design direction and nudges the model toward a fresh interpretation, so
 * "Regenerate" gives a genuinely different take rather than a near-dupe.
 */
export function buildEventCoilPrompt(event: HolidayEvent, regenCount = 0): string {
  const ideas = event.designIdeas.length ? event.designIdeas : [event.blurb];
  const idea = ideas[regenCount % ideas.length];

  const parts = [
    ENGRAVING_RULES.forGeneration,
    `Flat SQUARE (1:1) laser-etch coil-sleeve artwork celebrating "${event.name}".`,
    `Theme: ${event.blurb}`,
    `Design direction: ${idea}.`,
    'Bold, clean, high-contrast black-on-white line art that wraps a cylindrical coil sleeve; ' +
      'fill the square canvas evenly. No text, no lettering, no words.',
  ];
  if (regenCount > 0) {
    parts.push(`Give a fresh, distinct interpretation (variation ${regenCount + 1}).`);
  }
  return parts.join(' ');
}

export interface EventOccurrence {
  event: HolidayEvent;
  occurrence: Date;
  days: number;
}

/**
 * Events whose next occurrence is within [0, WINDOW_DAYS] days of `from` —
 * i.e. the ones that should have a mockup generated now.
 */
export function eventsWithinWindow(
  events: HolidayEvent[],
  from: Date = new Date(),
): EventOccurrence[] {
  const out: EventOccurrence[] = [];
  for (const event of events) {
    const occ = nextOccurrence(event, from);
    if (!occ) continue;
    const days = daysUntil(event, from);
    if (days >= 0 && days <= WINDOW_DAYS) out.push({ event, occurrence: occ, days });
  }
  return out.sort((a, b) => a.days - b.days);
}
