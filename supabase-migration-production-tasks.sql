-- Production readiness tasks
-- Explicit, checkable production-readiness tasks per concept. Readiness % is
-- DERIVED from these rows (completed / total) — never stored separately — so it
-- can't go stale. Each completion records when and who.

create table if not exists production_tasks (
  id           uuid primary key default gen_random_uuid(),
  concept_id   uuid not null,
  label        text not null,
  completed    boolean not null default false,
  completed_at timestamptz,
  completed_by text,
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- Prevents duplicate tasks when two first-loads race to seed the defaults.
  unique (concept_id, label)
);

create index if not exists production_tasks_concept_idx on production_tasks (concept_id);
