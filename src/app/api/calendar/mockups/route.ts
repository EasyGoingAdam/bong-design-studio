import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { mapRow } from '@/lib/calendar-mockups-server';

/**
 * GET /api/calendar/mockups
 * List every stored calendar mockup (camelCase). Tolerant: if the table
 * isn't migrated yet it returns [] so the calendar page never breaks.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('calendar_mockups')
      .select('*')
      .order('occurrence_date', { ascending: true });
    if (error) {
      console.warn('calendar_mockups GET failed (table missing?):', error.message);
      return NextResponse.json([]);
    }
    return NextResponse.json((data || []).map(mapRow));
  } catch {
    return NextResponse.json([]);
  }
}

/**
 * PATCH /api/calendar/mockups
 * Body: { eventId, occurrenceYear, kept }
 * Pin ("Keep") or unpin a mockup so the auto sweep won't replace it.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { eventId, occurrenceYear, kept } = await request.json();
    if (!eventId || typeof occurrenceYear !== 'number') {
      return NextResponse.json({ error: 'eventId and occurrenceYear are required' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('calendar_mockups')
      .update({ kept: !!kept, updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .eq('occurrence_year', occurrenceYear)
      .select('*')
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: 'Mockup not found' }, { status: 404 });
    return NextResponse.json(mapRow(data));
  } catch {
    return NextResponse.json({ error: 'Failed to update mockup' }, { status: 500 });
  }
}
