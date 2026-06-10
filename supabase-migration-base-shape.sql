-- Adds the base_shape column to concept_specs.
--
-- The app's ConceptSpecs.baseShape field (circle | oval | square |
-- rectangle) existed in the TypeScript types and UI pickers but was never
-- persisted — every save silently dropped it and every load defaulted to
-- 'circle'. The API routes now read/write base_shape; this migration adds
-- the column. (Until it runs, the routes degrade gracefully: the value is
-- stripped from writes and reads fall back to 'circle'.)

ALTER TABLE concept_specs
  ADD COLUMN IF NOT EXISTS base_shape text NOT NULL DEFAULT 'circle';
