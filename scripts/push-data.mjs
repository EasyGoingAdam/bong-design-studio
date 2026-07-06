#!/usr/bin/env node
/**
 * Push locally edited data/tables/*.json back up to Supabase.
 *
 *   node scripts/push-data.mjs                       # upsert every table
 *   node scripts/push-data.mjs concepts comments     # only these tables
 *
 * Rows are UPSERTED by primary/conflict key — existing rows are updated,
 * new rows inserted. Nothing is ever deleted: removing a row from the
 * JSON does NOT remove it from the database (delete by hand in Supabase
 * or via the app when you really mean it).
 *
 * Requires the same env vars as pull-data.mjs (service-role key strongly
 * recommended — the anon key will be blocked by RLS on most tables).
 */

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { TABLES, loadEnv, getSupabaseConfig, restHeaders } from './pull-data.mjs';

const ROOT = path.join(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BATCH = 200;

// Conflict targets that differ from the default `id` primary key
// (mirrors the onConflict usage in src/app/api/**).
const CONFLICT = {
  app_settings: 'key',
  concept_specs: 'concept_id',
  coil_specs: 'concept_id',
  base_specs: 'concept_id',
  manufacturing_records: 'concept_id',
};

async function pushTable(cfg, table) {
  const file = path.join(DATA_DIR, 'tables', `${table.name}.json`);
  if (!existsSync(file)) {
    console.log(`skipping ${table.name} (no local file)`);
    return;
  }
  const rows = JSON.parse(await readFile(file, 'utf8'));
  if (!Array.isArray(rows) || rows.length === 0) {
    console.log(`skipping ${table.name} (0 rows)`);
    return;
  }
  const conflict = CONFLICT[table.name] || 'id';
  let pushed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(
      `${cfg.url}/rest/v1/${table.name}?on_conflict=${conflict}`,
      {
        method: 'POST',
        headers: {
          ...restHeaders(cfg.key),
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(batch),
      }
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${body.slice(0, 300)}`);
    }
    pushed += batch.length;
  }
  console.log(`upserted ${pushed} rows into ${table.name}`);
}

async function main() {
  await loadEnv();
  const cfg = getSupabaseConfig();

  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const targets = only.length
    ? TABLES.filter((t) => only.includes(t.name))
    : TABLES;
  if (only.length && targets.length !== only.length) {
    const known = new Set(TABLES.map((t) => t.name));
    console.error(`Unknown table(s): ${only.filter((n) => !known.has(n)).join(', ')}`);
    process.exit(1);
  }

  for (const table of targets) {
    try {
      await pushTable(cfg, table);
    } catch (err) {
      console.error(`FAILED ${table.name}: ${err.message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
