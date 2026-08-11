import { NextRequest, NextResponse } from 'next/server';
import sharp from 'sharp';
import { supabaseAdmin, STORAGE_BUCKET, ensureBucket } from '@/lib/supabase';

/**
 * Health-check endpoint for core infrastructure.
 * Hit GET /api/health to verify sharp, Supabase Storage, and Supabase DB
 * connectivity are all working. Useful after deploys.
 *
 * Pass ?light=1 for the dashboard poll: it skips the storage upload+delete
 * round-trip (which would write to storage on every dashboard view) and instead
 * self-heals + inspects the bucket. The full endpoint keeps the write round-trip
 * for deploy smoke-tests.
 *
 * Response shape:
 *   { ok, checks: { sharp, storage, database }, features: {...} }
 */
export async function GET(request: NextRequest) {
  const light = new URL(request.url).searchParams.get('light') === '1';
  const checks: Record<string, { ok: boolean; detail?: string }> = {};

  // 1. Sharp — generate a tiny PNG, invert it, check bytes. Cheap + local, so
  // it runs in light mode too.
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

  // 2. Supabase Storage. Light mode self-heals the bucket and reports its
  // reachability without writing a throwaway object; full mode does a real
  // upload+delete round-trip.
  if (light) {
    try {
      await ensureBucket();
      const { data, error } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
      if (error || !data) throw error ?? new Error('bucket missing');
      checks.storage = { ok: true, detail: 'bucket reachable (no write test)' };
    } catch (err) {
      checks.storage = { ok: false, detail: err instanceof Error ? err.message : 'storage failed' };
    }
  } else {
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

  // ── Feature infrastructure ────────────────────────────────────────────
  // Optional-but-recommended backing for the newer features. These do NOT gate
  // the top-level `ok` (a fresh deploy is still healthy before the feature
  // migrations run) — they're surfaced so the Setup card can nudge the operator
  // to run the right migration / fix the bucket.
  const features: Record<string, { ok: boolean; detail?: string }> = {};

  // Storage bucket must be PUBLIC or the public image URLs 403.
  try {
    const { data } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
    features.bucketPublic = data
      ? { ok: data.public === true, detail: data.public ? 'public' : 'bucket is PRIVATE — images will not render' }
      : { ok: false, detail: 'bucket missing — it is auto-created on first upload' };
  } catch (err) {
    features.bucketPublic = { ok: false, detail: err instanceof Error ? err.message : 'bucket check failed' };
  }

  // coil_sizes — size presets (Small/Regular/XL)
  try {
    const { error, count } = await supabaseAdmin
      .from('coil_sizes')
      .select('id', { count: 'exact', head: true });
    features.coilSizes = error
      ? { ok: false, detail: 'table missing — run supabase-migration-coil-sizes.sql' }
      : { ok: true, detail: `${count ?? 0} presets` };
  } catch (err) {
    features.coilSizes = { ok: false, detail: err instanceof Error ? err.message : 'check failed' };
  }

  // calendar_mockups — auto-generated holiday coil designs
  try {
    const { error, count } = await supabaseAdmin
      .from('calendar_mockups')
      .select('id', { count: 'exact', head: true });
    features.calendarMockups = error
      ? { ok: false, detail: 'table missing — run supabase-migration-calendar-mockups.sql' }
      : { ok: true, detail: `${count ?? 0} designs` };
  } catch (err) {
    features.calendarMockups = { ok: false, detail: err instanceof Error ? err.message : 'check failed' };
  }

  const ok = Object.values(checks).every((c) => c.ok);

  return NextResponse.json(
    { ok, checks, features, timestamp: new Date().toISOString() },
    { status: ok ? 200 : 500 }
  );
}
