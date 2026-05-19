-- Concept Audit Log — records every state change on a Concept so the
-- team can answer "who did what when?" without a forensic dig.
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/jlatxzeiuwabgxjjhuic/sql/new
--
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS concept_audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id  UUID NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  -- Action grammar: `<resource>.<verb>`
  --   concept.create / concept.update / concept.delete / concept.move
  --   concept.image_swap
  --   version.add / version.restore
  --   approval.add
  --   comment.add / comment.delete
  --   manufacturing.update
  --   generation.add
  --   share_link.create / share_link.revoke
  --   import.from_cfp
  action      TEXT NOT NULL,
  actor_id    TEXT DEFAULT '',
  actor_name  TEXT DEFAULT '',
  -- before/after — sparse JSON; only the fields that actually changed
  -- (for updates) or the full row (for creates/deletes).
  before_data JSONB,
  after_data  JSONB,
  -- Soft attribution — best-effort, never trusted for auth decisions.
  ip_address  TEXT DEFAULT '',
  user_agent  TEXT DEFAULT '',
  -- Request correlation id from withLog() — lets you cross-reference an
  -- audit row with the Railway log line that fired it.
  req_id      TEXT DEFAULT '',
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Hot path: per-concept timeline, newest first.
CREATE INDEX IF NOT EXISTS idx_audit_concept_time
  ON concept_audit_log(concept_id, created_at DESC);

-- "What did <actor> do this week" view.
CREATE INDEX IF NOT EXISTS idx_audit_actor_time
  ON concept_audit_log(actor_id, created_at DESC)
  WHERE actor_id <> '';

-- "Find every status change" — filter by action across all concepts.
CREATE INDEX IF NOT EXISTS idx_audit_action_time
  ON concept_audit_log(action, created_at DESC);

-- RLS off — only the server-role admin client writes here.
ALTER TABLE concept_audit_log DISABLE ROW LEVEL SECURITY;
