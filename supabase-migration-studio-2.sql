-- Bong Design Studio 2.0 — simplified studio data model.
-- Additive: creates new tables only; does not touch `concepts` or any existing
-- table, so bots, archive, production, calendar and existing designs are safe.
-- Safe to run repeatedly.

-- ── Product templates ───────────────────────────────────────────────────────
-- One row per (product, design area). Employees pick "Freeze Pipe Bong → Coil"
-- and the software already knows the physical size / aspect / wrap behavior.
create table if not exists product_templates (
  id uuid primary key default gen_random_uuid(),
  product_name text not null,
  target_name text not null,            -- e.g. 'Coil', 'Base'
  target_type text default 'coil',       -- coil | base | tube | panel | wrap | custom
  width_in numeric,
  height_in numeric,
  units text default 'in',
  aspect_ratio numeric,                  -- width/height; null = derive
  shape text default 'standard',         -- standard | wide | tall | extra_wide | wrap | custom
  supports_wrap boolean default false,
  seamless_default boolean default false,
  preview_image text default '',
  machine_profile text default '',
  sort_order int default 0,
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (product_name, target_name)
);

-- ── Design projects ─────────────────────────────────────────────────────────
create table if not exists design_projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  original_request text default '',      -- the employee's plain-language ask
  refined_prompt text default '',        -- brainstorm-refined concept
  product_name text default '',          -- denormalized for the archive card
  type text default 'single',            -- single | set
  relationship text default 'coordinated', -- same | coordinated  (for sets)
  status text default 'draft',           -- draft | favorite | approved | produced | archived
  created_by text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_design_projects_status on design_projects (status);
create index if not exists idx_design_projects_updated on design_projects (updated_at desc);

-- ── Design targets (where artwork goes: coil, base, …) ──────────────────────
create table if not exists design_targets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references design_projects(id) on delete cascade,
  name text not null,                    -- Coil / Base / …
  target_type text default 'coil',
  product_template_id uuid references product_templates(id) on delete set null,
  physical_width numeric,
  physical_height numeric,
  units text default 'in',
  aspect_ratio numeric,
  shape text default 'standard',
  wrap boolean default false,
  seamless boolean default false,
  detail_level text default 'balanced',  -- simple | balanced | intricate
  etch_coverage text default 'medium',   -- light | medium | heavy
  current_version_id uuid,               -- the "live" version (fk added below)
  sort_order int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_design_targets_project on design_targets (project_id);

-- ── Design versions (every generation / edit / reverse is a version) ────────
create table if not exists design_versions (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references design_targets(id) on delete cascade,
  version_number int not null default 1,
  parent_version_id uuid references design_versions(id) on delete set null,
  feedback text default '',              -- what the user asked to change
  generation_prompt text default '',     -- the full hidden production prompt
  image_url text default '',             -- production master (binary B/W)
  raw_image_url text default '',         -- optional AI-raw before processing
  png_url text default '',
  svg_url text default '',
  jpg_url text default '',
  inverted boolean default false,
  black_coverage numeric,                -- % black, for density validation
  generation_provider text default '',
  created_by text default '',
  created_at timestamptz default now()
);
create index if not exists idx_design_versions_target on design_versions (target_id);

-- current_version_id → design_versions (added after both tables exist)
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'design_targets_current_version_fk'
  ) then
    alter table design_targets
      add constraint design_targets_current_version_fk
      foreign key (current_version_id) references design_versions(id) on delete set null;
  end if;
end $$;

-- ── Seed a couple of product templates so the picker isn't empty ────────────
insert into product_templates (product_name, target_name, target_type, width_in, height_in, aspect_ratio, shape, supports_wrap, seamless_default, sort_order)
values
  ('Freeze Pipe Bong', 'Coil', 'coil', 4.25, 1.15, 3.70, 'wide', true, true, 0),
  ('Freeze Pipe Bong', 'Base', 'base', 3.00, 3.00, 1.00, 'standard', false, false, 1),
  ('Straight Tube',    'Wrap', 'wrap', 6.00, 2.00, 3.00, 'wrap', true, true, 2),
  ('Beaker Base',      'Base', 'base', 4.00, 4.00, 1.00, 'standard', false, false, 3)
on conflict (product_name, target_name) do nothing;
