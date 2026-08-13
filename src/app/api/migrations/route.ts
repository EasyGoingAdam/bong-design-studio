import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Serves the checked-in migration SQL so the dashboard Setup card can offer a
// one-click "Copy SQL". Allowlisted slugs only (no arbitrary file reads), and
// graceful if a file isn't present in this deploy layout.
const MIGRATIONS: Record<string, string> = {
  'coil-sizes': 'supabase-migration-coil-sizes.sql',
  'calendar-mockups': 'supabase-migration-calendar-mockups.sql',
  'manufacturing-products': 'supabase-migration-manufacturing-products.sql',
  'production-tasks': 'supabase-migration-production-tasks.sql',
};

export async function GET() {
  const out: Record<string, string> = {};
  for (const [slug, file] of Object.entries(MIGRATIONS)) {
    try {
      out[slug] = await readFile(path.join(process.cwd(), file), 'utf8');
    } catch {
      // Not present in this deploy — the card falls back to showing the filename.
    }
  }
  return NextResponse.json(out);
}
