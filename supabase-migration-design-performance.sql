-- Design performance / knowledge log
-- Where the Grok bot writes what it learns about each design: sales, sell-through,
-- its own rating, and any freeform metrics. An append log (many rows per design,
-- newest wins in the export) so trends over time are preserved. Powers the bot's
-- goal of becoming the expert on what laser-etched designs actually sell.

create table if not exists design_performance (
  id                 uuid primary key default gen_random_uuid(),
  concept_id         uuid not null,
  source             text default 'grok',       -- who reported it (grok / shopify / manual)
  units_sold         integer,
  revenue            numeric,
  sell_through_rate  numeric,                    -- 0..1
  rating             numeric,                    -- the bot's score for the design
  period_start       date,
  period_end         date,
  metrics            jsonb,                      -- freeform extra metrics / knowledge
  notes              text,
  recorded_at        timestamptz not null default now()
);

create index if not exists design_performance_concept_idx on design_performance (concept_id);
create index if not exists design_performance_recorded_idx on design_performance (recorded_at desc);
