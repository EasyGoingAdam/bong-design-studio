-- Coil-only concepts — adds a flag so concepts without a base piece can
-- skip base generation and hide base UI throughout the app.
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS coil_only BOOLEAN DEFAULT false;

UPDATE concepts SET coil_only = false WHERE coil_only IS NULL;
