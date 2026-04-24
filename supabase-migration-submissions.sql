-- External submissions — adds fields so concepts pushed in via the
-- /api/incoming/concept endpoint carry attribution back to the originating
-- tool (e.g. the customer-facing design tool you're building).
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE concepts
  ADD COLUMN IF NOT EXISTS source           TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS external_id      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS external_url     TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitter_email  TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS submitter_name   TEXT DEFAULT '';

-- Composite unique index so re-sending the same (source, external_id) pair
-- updates the existing concept instead of duplicating. The partial WHERE
-- makes it tolerant of empty strings (our default).
CREATE UNIQUE INDEX IF NOT EXISTS concepts_source_external_unique
  ON concepts(source, external_id)
  WHERE external_id IS NOT NULL AND external_id <> '';
