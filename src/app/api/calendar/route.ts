import { NextRequest, NextResponse } from 'next/server';
import { HOLIDAY_EVENTS, eventsForYear, HolidayCategory } from '@/lib/holiday-events';

/**
 * GET /api/calendar?year=2026&category=cannabis,major
 *
 * Returns an iCalendar (.ics) feed of the holiday list. Designed to be
 * imported into Google Calendar / Apple Calendar / Outlook either as a
 * one-time download or a subscription URL (Google Cal "From URL").
 *
 * Query params:
 *   year       — single year (e.g. 2026). If omitted, returns 3 years
 *                (current + next two) so subscribers see the future.
 *   category   — comma-separated category filter
 *                (cannabis,major,cultural,pet,food,awareness,fun,seasonal,music)
 *
 * Format: RFC 5545 compliant. Events are full-day VEVENTs in UTC date
 * format (DTSTART;VALUE=DATE), which Google/Apple treat as floating
 * all-day in the user's local timezone — correct for holidays.
 */

const VALID_CATEGORIES: ReadonlySet<HolidayCategory> = new Set([
  'cannabis', 'major', 'cultural', 'pet', 'food', 'awareness', 'fun', 'seasonal', 'music',
]);

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
function icsDate(d: Date): string {
  // YYYYMMDD (all-day VALUE=DATE form)
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}
function icsStamp(d: Date): string {
  // YYYYMMDDTHHMMSSZ
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}
/**
 * iCalendar text escaping per RFC 5545 §3.3.11:
 *   backslash → \\, comma → \,, semicolon → \;, newline → \n
 */
function escapeIcsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\r?\n/g, '\\n');
}
/** Long lines must be folded to 75 octets per RFC 5545 §3.1 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const chunks: string[] = [];
  let i = 0;
  while (i < line.length) {
    chunks.push((i === 0 ? '' : ' ') + line.slice(i, i + 73));
    i += 73;
  }
  return chunks.join('\r\n');
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const yearParam = url.searchParams.get('year');
  const categoryParam = url.searchParams.get('category');

  const allowedCategories = new Set<HolidayCategory>();
  if (categoryParam) {
    for (const c of categoryParam.split(',').map((s) => s.trim())) {
      if (VALID_CATEGORIES.has(c as HolidayCategory)) {
        allowedCategories.add(c as HolidayCategory);
      }
    }
  }

  const now = new Date();
  const years: number[] = yearParam
    ? [parseInt(yearParam, 10)].filter((n) => !isNaN(n) && n >= 2020 && n <= 2050)
    : [now.getFullYear(), now.getFullYear() + 1, now.getFullYear() + 2];

  const stamp = icsStamp(now);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Design Studio//Holiday Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    foldLine('X-WR-CALNAME:Design Studio — Holidays & Observances'),
    foldLine('X-WR-CALDESC:Holidays + cannabis dates + pet days + obscure observances for laser-etching concept planning'),
    'X-WR-TIMEZONE:UTC',
    'REFRESH-INTERVAL;VALUE=DURATION:PT12H',
    'X-PUBLISHED-TTL:PT12H',
  ];

  for (const year of years) {
    for (const { event, date } of eventsForYear(year)) {
      if (allowedCategories.size > 0 && !allowedCategories.has(event.category)) continue;

      const dtStart = icsDate(date);
      const dtEnd = icsDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1));
      const summary = `${event.emoji} ${event.name}`;
      const description = [
        event.blurb,
        event.designIdeas.length ? '\nDesign ideas:\n' + event.designIdeas.map((d) => '• ' + d).join('\n') : '',
        '\nCategory: ' + event.category,
      ].filter(Boolean).join('');

      lines.push(
        'BEGIN:VEVENT',
        foldLine(`UID:${event.id}-${year}@design-studio`),
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${dtStart}`,
        `DTEND;VALUE=DATE:${dtEnd}`,
        foldLine(`SUMMARY:${escapeIcsText(summary)}`),
        foldLine(`DESCRIPTION:${escapeIcsText(description)}`),
        foldLine(`CATEGORIES:${event.category.toUpperCase()}`),
        'TRANSP:TRANSPARENT',
        'END:VEVENT',
      );
    }
  }
  lines.push('END:VCALENDAR');

  const body = lines.join('\r\n') + '\r\n';

  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': yearParam
        ? `attachment; filename="design-studio-holidays-${yearParam}.ics"`
        : `attachment; filename="design-studio-holidays.ics"`,
      // Cache aggressively for subscribers — content only changes when we
      // edit the event list, not per-request.
      'Cache-Control': 'public, max-age=3600, s-maxage=43200',
    },
  });
}

/**
 * Reference all imports so tree-shaking doesn't drop side effects we want.
 * (HOLIDAY_EVENTS is iterated indirectly via eventsForYear so this is just
 * defensive — keep TS happy if eventsForYear ever changes signature.)
 */
void HOLIDAY_EVENTS;
