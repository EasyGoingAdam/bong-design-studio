import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// GET all settings
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convert array to object
    const settings: Record<string, string> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }

    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 });
  }
}

// PUT upsert a setting
export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json();

    if (!key) {
      return NextResponse.json({ error: 'Key is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert(
        { key, value: value || '', updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to save setting' }, { status: 500 });
  }
}
