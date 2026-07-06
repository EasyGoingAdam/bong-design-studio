import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Keys the browser is allowed to read. Everything else in app_settings is
// server-only (e.g. `shipstation_token`, read directly by the server via
// supabaseAdmin) and must NEVER be returned to a client — otherwise this
// endpoint dumps integration secrets to anyone with a session. The store
// (src/lib/store.ts) consumes exactly these four keys.
const CLIENT_READABLE_SETTINGS = new Set([
  'openai_key',
  'gemini_key',
  'user_name',
  'production_settings',
]);

// GET client-readable settings only
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('app_settings')
      .select('key, value');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Convert array to object, filtered to the client allowlist so no
    // server-only secret can leak through the response body.
    const settings: Record<string, string> = {};
    for (const row of data || []) {
      if (CLIENT_READABLE_SETTINGS.has(row.key)) settings[row.key] = row.value;
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
