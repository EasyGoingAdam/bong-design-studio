-- Marketing Studio — adds three columns to the concepts table for the
-- product-photo compositing feature. Safe to re-run (IF NOT EXISTS).
--
-- Run this in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/<your-project>/sql/new

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS product_photo_url       TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS marketing_graphic_url   TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS marketing_tagline       TEXT DEFAULT '';

-- Backfill nulls to empty string in case any rows predate the DEFAULT
UPDATE concepts SET product_photo_url     = '' WHERE product_photo_url     IS NULL;
UPDATE concepts SET marketing_graphic_url = '' WHERE marketing_graphic_url IS NULL;
UPDATE concepts SET marketing_tagline     = '' WHERE marketing_tagline     IS NULL;
