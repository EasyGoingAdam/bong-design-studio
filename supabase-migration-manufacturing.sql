-- Manufacturing / Production Schedule
--
-- Adds the production-planning data model: machines, production jobs,
-- per-day schedule (with locking), and an audit log. Server-side routes
-- use the service-role key so RLS staying enabled is fine — no anon access.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/jlatxzeiuwabgxjjhuic/sql/new
-- Safe to re-run (IF NOT EXISTS / guarded seeds).

-- ── Machines ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name               TEXT NOT NULL,
  active             BOOLEAN DEFAULT true,
  daily_piece_target INTEGER DEFAULT 4,
  daily_hours        NUMERIC DEFAULT 8,      -- available run hours/day for utilization %
  notes              TEXT DEFAULT '',
  position           INTEGER DEFAULT 0,       -- column order on the board
  created_at         TIMESTAMPTZ DEFAULT now()
);

-- Seed the two laser machines once (idempotent by name).
INSERT INTO machines (name, daily_piece_target, daily_hours, position)
SELECT 'Laser Machine 1', 4, 8, 0
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE name = 'Laser Machine 1');
INSERT INTO machines (name, daily_piece_target, daily_hours, position)
SELECT 'Laser Machine 2', 4, 8, 1
WHERE NOT EXISTS (SELECT 1 FROM machines WHERE name = 'Laser Machine 2');

-- ── Per-day schedule (lock state) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_schedule_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date        DATE NOT NULL UNIQUE,
  locked      BOOLEAN DEFAULT false,
  locked_at   TIMESTAMPTZ,
  locked_by   TEXT DEFAULT '',
  notes       TEXT DEFAULT '',
  ai_summary  JSONB,                          -- last AI schedule/review payload
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

-- ── Production jobs ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_jobs (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    TEXT NOT NULL,
  -- where the job came from: 'manual' | 'workflow' | 'shipstation'
  source_type              TEXT DEFAULT 'manual',
  source_id                TEXT DEFAULT '',
  concept_id               UUID REFERENCES concepts(id) ON DELETE SET NULL,
  order_id                 TEXT DEFAULT '',
  shipstation_order_id     TEXT DEFAULT '',
  product_type             TEXT DEFAULT '',
  sku                      TEXT DEFAULT '',
  quantity                 INTEGER DEFAULT 1,
  -- complexity drives default time: low|medium|high|very_high
  complexity               TEXT DEFAULT 'medium',
  -- setup complexity is SEPARATE from engraving complexity
  setup_complexity         TEXT DEFAULT 'medium',
  alignment_difficulty     TEXT DEFAULT 'medium',  -- low|medium|high
  detail_level             TEXT DEFAULT 'medium',
  etching_zones            INTEGER DEFAULT 1,
  repeat_design            BOOLEAN DEFAULT false,   -- repeat jobs schedule faster
  estimated_setup_minutes  INTEGER DEFAULT 0,
  estimated_run_minutes    INTEGER DEFAULT 0,
  estimated_finish_minutes INTEGER DEFAULT 0,
  estimated_total_minutes  INTEGER DEFAULT 0,
  actual_start_time        TIMESTAMPTZ,
  actual_end_time          TIMESTAMPTZ,
  actual_total_minutes     INTEGER,
  -- accumulated paused/running tracking
  paused_at                TIMESTAMPTZ,
  accumulated_minutes      INTEGER DEFAULT 0,
  machine_id               UUID REFERENCES machines(id) ON DELETE SET NULL,
  operator_id              TEXT DEFAULT '',
  operator_name            TEXT DEFAULT '',
  scheduled_date           DATE,
  scheduled_position       INTEGER DEFAULT 0,
  -- backlog|scheduled|in_progress|paused|completed|rework|held
  status                   TEXT DEFAULT 'backlog',
  priority                 TEXT DEFAULT 'medium',   -- low|medium|high|urgent
  due_date                 DATE,
  ship_by_date             DATE,
  order_date               DATE,
  rush                     BOOLEAN DEFAULT false,
  revenue_value            NUMERIC DEFAULT 0,
  inventory_available      BOOLEAN DEFAULT true,
  design_name              TEXT DEFAULT '',
  design_image_url         TEXT DEFAULT '',
  customer_name            TEXT DEFAULT '',
  tags                     JSONB DEFAULT '[]'::jsonb,
  notes                    TEXT DEFAULT '',
  design_notes             TEXT DEFAULT '',
  override_reason          TEXT DEFAULT '',
  locked_schedule_id       UUID REFERENCES production_schedule_days(id) ON DELETE SET NULL,
  quantity_completed       INTEGER DEFAULT 0,
  quantity_failed          INTEGER DEFAULT 0,
  rework_reason            TEXT DEFAULT '',
  scrap_count              INTEGER DEFAULT 0,
  -- AI brain output
  ai_confidence            NUMERIC,
  ai_reasoning             TEXT DEFAULT '',
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prodjobs_scheduled_date ON production_jobs(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_prodjobs_status         ON production_jobs(status);
CREATE INDEX IF NOT EXISTS idx_prodjobs_machine        ON production_jobs(machine_id);
CREATE INDEX IF NOT EXISTS idx_prodjobs_concept        ON production_jobs(concept_id);

-- ── Audit log ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS production_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_job_id UUID REFERENCES production_jobs(id) ON DELETE CASCADE,
  action            TEXT NOT NULL,
  old_value         JSONB,
  new_value         JSONB,
  user_id           TEXT DEFAULT '',
  user_name         TEXT DEFAULT '',
  reason            TEXT DEFAULT '',
  created_at        TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prodlogs_job_time ON production_logs(production_job_id, created_at DESC);
