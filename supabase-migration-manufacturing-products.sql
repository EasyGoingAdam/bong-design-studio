-- Manufacturing product rules (SKU → requires custom manufacturing)
-- The reliable, DB-driven way to decide which ShipStation items are custom
-- manufacturables — instead of guessing from product-name text. Editable in the
-- Specs DB tab; the ShipStation import matches each item's SKU against these
-- rules (falling back to the name/keyword heuristic when no rule matches).

create table if not exists manufacturing_products (
  id                            uuid primary key default gen_random_uuid(),
  sku                           text not null,
  product_name                  text not null default '',
  -- Whether an order line with this SKU should be imported as a manufacturable.
  requires_custom_manufacturing boolean not null default true,
  -- Optional coil size preset name (matches coil_sizes.name: Small/Regular/XL).
  coil_type                     text,
  -- Inactive rules are ignored by the import (kept for history).
  active                        boolean not null default true,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (sku)
);

-- Case-insensitive SKU lookups from the import.
create index if not exists manufacturing_products_sku_lower_idx
  on manufacturing_products (lower(sku));
