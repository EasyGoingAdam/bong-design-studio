import { NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin, STORAGE_BUCKET } from '@/lib/supabase';

/**
 * Health-check endpoint for core infrastructure.
 * Hit GET /api/health to verify sharp, Supabase Storage upload,
 * and Supabase DB connectivity are all working. Useful after deploys.
 *
 * Response shape:
 *   { ok: true, checks: { sharp, storage, database } }
 */
export async function GET() {
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1. Sharp — generate a tiny PNG, invert it, check bytes
  try {
    const source = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();

    const inverted = await sharp(source)
      .negate({ alpha: false })
      .png()
      .toBuffer();

    // Invert of pure black should not equal source
    checks.sharp = {
      ok: inverted.length > 0 && !inverted.equals(source),
      detail: `source=${source.length}B inverted=${inverted.length}B`,
    };
  } catch (err) {
    checks.sharp = { ok: false, detail: err instanceof Error ? err.message : 'sharp failed' };
  }

  // 2. Supabase Storage — upload a tiny test image then delete it
  try {
    const testBuffer = await sharp({
      create: { width: 2, height: 2, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();
    const testPath = `health/health-${Date.now()}.png`;

    const upload = await supabaseAdmin.storage
      .from(STORAGE_BUCKET)
      .upload(testPath, testBuffer, { contentType: 'image/png', upsert: false });

    if (upload.error) throw upload.error;

    // Clean up
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([testPath]);

    checks.storage = { ok: true, detail: 'upload + delete round-trip ok' };
  } catch (err) {
    checks.storage = { ok: false, detail: err instanceof Error ? err.message : 'storage failed' };
  }

  // 3. Supabase DB — quick select count
  try {
    const { error, count } = await supabaseAdmin
      .from('concepts')
      .select('id', { count: 'exact', head: true });
    if (error) throw error;
    checks.database = { ok: true, detail: `${count ?? 0} concepts` };
  } catch (err) {
    checks.database = { ok: false, detail: err instanceof Error ? err.message : 'db failed' };
  }

  const ok = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { ok, checks, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 500 }
  );
}
