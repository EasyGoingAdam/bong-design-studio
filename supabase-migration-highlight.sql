-- Adds the `highlighted` boolean to concepts for the workflow-card
-- star/flag feature. Lets a production lead mark specific concepts as
-- "design this soonest" without changing the priority semantic.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/jlatxzeiuwabgxjjhuic/sql/new
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS highlighted BOOLEAN DEFAULT false;

UPDATE concepts SET highlighted = false WHERE highlighted IS NULL;

-- Partial index — only the highlighted rows matter for the "starred only"
-- workflow filter; non-highlighted rows are the bulk and don't need an
-- index entry.
CREATE INDEX IF NOT EXISTS idx_concepts_highlighted
  ON concepts(highlighted) WHERE highlighted = true;
