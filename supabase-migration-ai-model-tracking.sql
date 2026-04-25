-- Adds model + provider columns to ai_generations so we can track which
-- engine produced each output (Gemini vs ChatGPT Image vs ChatGPT Image
-- 2.0). Safe to re-run.
--
-- Run this in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/jlatxzeiuwabgxjjhuic/sql/new

ALTER TABLE ai_generations
  ADD COLUMN IF NOT EXISTS model    TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS provider TEXT DEFAULT '';

UPDATE ai_generations SET model    = '' WHERE model    IS NULL;
UPDATE ai_generations SET provider = '' WHERE provider IS NULL;
