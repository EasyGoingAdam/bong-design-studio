-- Coil size presets
-- Editable named sizes (Small / Regular / XL …) with inch measurements. The
-- quick-generate modal's size checkboxes read these to fill the design
-- dimensions, and they're editable in the Specs DB tab.

create table if not exists coil_sizes (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  width_in    numeric not null default 0,
  height_in   numeric not null default 0,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Seed the three standard presets, but only if the table is empty so re-running
-- the migration never duplicates or clobbers edited values.
insert into coil_sizes (name, width_in, height_in, sort_order)
select v.name, v.width_in, v.height_in, v.sort_order
from (values
  ('Small',   3, 5, 1),
  ('Regular', 4, 7, 2),
  ('XL',      6, 7, 3)
) as v(name, width_in, height_in, sort_order)
where not exists (select 1 from coil_sizes);
