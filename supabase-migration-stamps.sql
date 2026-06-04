-- Stamps: alternative design format for concepts that need 1-5 small,
-- thematically-related engraving graphics instead of one large coil
-- design. Each row in the `stamps` JSON array is { id, subject,
-- imageUrl, prompt, createdAt, model? }.
--
-- design_type defaults to 'standard' so every existing concept keeps
-- its current behavior. 'stamps' switches the workflow / detail UI to
-- the multi-mini-graphic layout.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/jlatxzeiuwabgxjjhuic/sql/new
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS design_type TEXT  DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS stamps      JSONB DEFAULT '[]'::jsonb;

-- Backfill nulls in case any rows predate the DEFAULT.
UPDATE concepts SET design_type = 'standard' WHERE design_type IS NULL;
UPDATE concepts SET stamps      = '[]'::jsonb WHERE stamps IS NULL;

-- Partial index — most concepts will be 'standard', only the stamps
-- ones need fast filtering.
CREATE INDEX IF NOT EXISTS idx_concepts_stamps
  ON concepts(design_type) WHERE design_type = 'stamps';
