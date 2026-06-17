-- Production end-of-day close-out.
--
-- Adds close-out state to the per-day schedule so the operator must record
-- what got done / what didn't / why before closing the day. `closeout` holds
-- the structured answers; `closed` gates the day.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE production_schedule_days
  ADD COLUMN IF NOT EXISTS closed     BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_by  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS closeout   JSONB;
