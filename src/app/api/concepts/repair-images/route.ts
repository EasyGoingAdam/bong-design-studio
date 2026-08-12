import { NextResponse } from 'next/server';
import { supabaseAdmin, uploadImage } from '@/lib/supabase';

// Re-uploads any concept image that was stored as a base64 data URI (a failed
// upload's fallback) to Supabase Storage, then rewrites the row to point at the
// small public URL. Makes the storage-persistence fix retroactive — repairing
// images that were saved before the bucket was healthy. Idempotent.
export const maxDuration = 300;

const IMAGE_COLS = [
  'coil_image_url',
  'base_image_url',
  'combined_image_url',
  'product_mockup_url',
  'marketing_graphic_url',
] as const;

export async function POST() {
  try {
    // select('*') so a not-yet-migrated image column can't fail the whole
    // repair with a "column not found" error — missing fields read as undefined.
    const { data: rows, error } = await supabaseAdmin.from('concepts').select('*');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let conceptsRepaired = 0;
    let imagesRepaired = 0;
    let stillFailing = 0;

    for (const raw of rows ?? []) {
      const row = raw as unknown as Record<string, unknown>;
      const id = row.id as string;
      const updates: Record<string, string> = {};

      for (const col of IMAGE_COLS) {
        const val = row[col];
        if (typeof val === 'string' && val.startsWith('data:')) {
          try {
            const url = await uploadImage(val, 'repair', `${id}-${col}`);
            // uploadImage returns the data URI unchanged if storage STILL fails
            // — only rewrite the row when it actually became a storage URL.
            if (!url.startsWith('data:')) {
              updates[col] = url;
              imagesRepaired += 1;
            } else {
              stillFailing += 1;
            }
          } catch {
            stillFailing += 1;
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        const { error: updErr } = await supabaseAdmin.from('concepts').update(updates).eq('id', id);
        if (!updErr) conceptsRepaired += 1;
      }
    }

    return NextResponse.json({ ok: true, conceptsRepaired, imagesRepaired, stillFailing });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Repair failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
