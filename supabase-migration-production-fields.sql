-- Production job: coil size, text/design drivers, customer contact.
--
-- Run in the Supabase SQL editor. Safe to re-run.

ALTER TABLE production_jobs
  ADD COLUMN IF NOT EXISTS coil_size      TEXT,          -- pipe | small_coil | big_coil
  ADD COLUMN IF NOT EXISTS has_text       BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_design     BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS text_name      TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_email TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_phone TEXT DEFAULT '';
