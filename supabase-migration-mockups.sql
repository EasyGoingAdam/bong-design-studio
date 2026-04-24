-- Mockup Studio — adds columns for AI-rendered product mockups.
-- Safe to re-run (IF NOT EXISTS).
--
-- Run this in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/<your-project>/sql/new

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS blank_product_url     TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_mockup_url    TEXT  DEFAULT '',
  ADD COLUMN IF NOT EXISTS product_mockup_angles JSONB DEFAULT '[]'::jsonb;

UPDATE concepts SET blank_product_url     = '' WHERE blank_product_url     IS NULL;
UPDATE concepts SET product_mockup_url    = '' WHERE product_mockup_url    IS NULL;
UPDATE concepts SET product_mockup_angles = '[]'::jsonb WHERE product_mockup_angles IS NULL;
