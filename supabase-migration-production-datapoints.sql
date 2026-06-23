-- More production datapoints + durable daily report snapshots.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE production_jobs
  ADD COLUMN IF NOT EXISTS material         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS machine_settings TEXT DEFAULT '',  -- power / speed / passes notes
  ADD COLUMN IF NOT EXISTS qc_result        TEXT DEFAULT '',  -- pass | fail | ''
  ADD COLUMN IF NOT EXISTS qc_notes         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS pause_count      INTEGER DEFAULT 0;

-- Durable per-day production snapshots so historical reporting survives even
-- as jobs are rescheduled/edited/deleted. `data` holds the full computed
-- report (KPIs + per-machine/operator + job rows) at snapshot time.
CREATE TABLE IF NOT EXISTS production_daily_reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL UNIQUE,
  data        JSONB NOT NULL,
  created_by  TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_daily_reports_date ON production_daily_reports(date DESC);
