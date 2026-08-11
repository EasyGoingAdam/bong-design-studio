import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseAnonKey;

// Client-side Supabase client (uses anon key)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (uses service role key for storage uploads)
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export const STORAGE_BUCKET = 'concept-images';

/**
 * Ensure the storage bucket exists and is public.
 *
 * A missing or private bucket is the usual reason uploads fail — the caller
 * then falls back to embedding a multi-megabyte base64 data URI, which is too
 * large to persist reliably on the concept row, so generated images "vanish on
 * refresh." Provisioning the bucket up front (idempotent, cached after the
 * first success) keeps images as small public URLs that round-trip cleanly.
 *
 * Best-effort: any failure is logged and the upload still proceeds, so this can
 * only help, never block.
 */
let bucketEnsured = false;
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return;
  try {
    const { data } = await supabaseAdmin.storage.getBucket(STORAGE_BUCKET);
    if (!data) {
      const { error: createErr } = await supabaseAdmin.storage.createBucket(STORAGE_BUCKET, {
        public: true,
      });
      // A concurrent create loses the race with an "already exists" error —
      // that's fine, the bucket is there.
      if (createErr && !/exist/i.test(createErr.message)) {
        console.error('ensureBucket: create failed:', createErr.message);
        return; // don't cache — let a later upload retry provisioning
      }
    } else if (data.public === false) {
      // Bucket exists but is private → getPublicImageUrl() links would 403 and
      // images wouldn't render. Flip it public.
      const { error: updErr } = await supabaseAdmin.storage.updateBucket(STORAGE_BUCKET, {
        public: true,
      });
      if (updErr) {
        console.error('ensureBucket: make-public failed:', updErr.message);
        return; // don't cache — retry next upload
      }
    }
    bucketEnsured = true;
  } catch (err) {
    console.error('ensureBucket: check failed:', err);
    // Leave uncached so we retry next upload.
  }
}

export function getPublicImageUrl(path: string): string {
  if (!path) return '';
  // If it's already a full URL or data URI, return as-is
  if (path.startsWith('http') || path.startsWith('data:')) return path;
  return `${supabaseUrl}/storage/v1/object/public/${STORAGE_BUCKET}/${path}`;
}

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export async function uploadImage(base64Data: string, folder: string, filename: string): Promise<string> {
  // Sniff the actual MIME type from the data-URI prefix. We used to hard-code
  // image/png which mislabeled JPEG/WebP bytes — the CDN would then serve a
  // PNG content-type for non-PNG bytes, breaking rendering in some browsers.
  const match = base64Data.match(/^data:([^;]+);base64,(.+)$/);
  let mime = 'image/png';
  let base64 = base64Data;
  if (match) {
    mime = (match[1] || 'image/png').trim();
    base64 = match[2];
  } else {
    // Bare base64 without a data-URI prefix — assume PNG.
    base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  }
  if (!MIME_EXT[mime]) mime = 'image/png';
  const ext = MIME_EXT[mime];

  const buffer = Buffer.from(base64, 'base64');
  const path = `${folder}/${filename}-${Date.now()}.${ext}`;

  // Make sure the bucket is there (and public) before we try to write to it.
  await ensureBucket();

  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: false,
    });

  if (error) {
    console.error('Upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }

  return getPublicImageUrl(path);
}
