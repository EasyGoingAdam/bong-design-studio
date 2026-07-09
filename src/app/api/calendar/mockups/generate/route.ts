import { NextRequest, NextResponse } from 'next/server';
import { resolveEvent, generateAndStoreMockup } from '@/lib/calendar-mockups-server';

// Image generation can take a while — lift the default function timeout.
export const maxDuration = 300;

/**
 * POST /api/calendar/mockups/generate
 * Body: { eventId, apiKey, force? }
 *
 * On-demand coil-mockup generation for one event (used by the calendar's
 * "Generate now", "Regenerate", and the on-visit auto-fill). The browser
 * supplies its OpenAI key. `force: true` regenerates even if one exists.
 */
export async function POST(request: NextRequest) {
  try {
    const { eventId, apiKey, force } = await request.json();
    if (!eventId) return NextResponse.json({ error: 'eventId is required' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'OpenAI API key is required. Set it in Settings.' }, { status: 400 });

    const resolved = resolveEvent(eventId);
    if (!resolved) return NextResponse.json({ error: `Unknown event: ${eventId}` }, { status: 404 });

    const result = await generateAndStoreMockup(resolved.event, resolved.occurrence, apiKey, { force: !!force });
    if (result.status === 'failed') {
      return NextResponse.json({ error: result.reason || 'Generation failed' }, { status: 502 });
    }
    return NextResponse.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to generate mockup';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
