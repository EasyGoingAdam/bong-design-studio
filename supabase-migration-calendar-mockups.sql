-- Calendar auto-mockups
-- One AI-generated coil design image per holiday event, per year's occurrence.
-- The calendar page reads these to show a usable coil design on each event;
-- rows are created automatically when an event comes within 40 days (via the
-- cron sweep or the on-visit fallback), and users can Keep or Regenerate them.

create table if not exists calendar_mockups (
  id               uuid primary key default gen_random_uuid(),
  -- HolidayEvent.id from src/lib/holiday-events.ts (e.g. 'valentines').
  event_id         text not null,
  event_name       text not null default '',
  -- The year of the occurrence this mockup is for, so next year's Valentine's
  -- gets its own fresh mockup. (event_id, occurrence_year) is unique.
  occurrence_year  integer not null,
  occurrence_date  date,
  image_url        text not null default '',
  prompt           text not null default '',
  -- 'ready' once an image is stored, 'failed' if generation errored.
  status           text not null default 'ready',
  error            text,
  -- User pressed "Keep": pins this image so the sweep/regeneration won't
  -- replace it.
  kept             boolean not null default false,
  -- How many times it's been regenerated — also rotates the design direction.
  regen_count      integer not null default 0,
  model            text,
  provider         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (event_id, occurrence_year)
);

create index if not exists calendar_mockups_year_idx
  on calendar_mockups (occurrence_year);
