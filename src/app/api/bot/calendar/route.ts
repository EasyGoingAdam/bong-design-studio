import { NextRequest, NextResponse } from 'next/server';
import { HOLIDAY_EVENTS, nextOccurrence, daysUntil } from '@/lib/holiday-events';
import { requireBotKey } from '@/lib/bot-api';

export const maxDuration = 30;

/**
 * GET /api/bot/calendar?days= — upcoming holidays/events the bot should design
 * drops for, with each event's design-idea hints. Query: days (default 120, <=365).
 */
export async function GET(request: NextRequest) {
  const denied = await requireBotKey(request);
  if (denied) return denied;
  const days = Math.min(Math.max(parseInt(request.nextUrl.searchParams.get('days') || '120', 10) || 120, 1), 365);
  const from = new Date();

  const events = HOLIDAY_EVENTS
    .map((e) => {
      const occ = nextOccurrence(e, from);
      const d = daysUntil(e, from);
      return { e, occ, d };
    })
    .filter((x) => x.occ && x.d >= 0 && x.d <= days)
    .sort((a, b) => a.d - b.d)
    .map(({ e, occ, d }) => ({
      id: e.id,
      name: e.name,
      date: occ!.toISOString().slice(0, 10),
      daysUntil: d,
      emoji: e.emoji,
      category: e.category,
      blurb: e.blurb,
      designIdeas: e.designIdeas,
    }));

  return NextResponse.json({ windowDays: days, count: events.length, events });
}
