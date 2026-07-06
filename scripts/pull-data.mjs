#!/usr/bin/env node
/**
 * Pull every Supabase table (and optionally the concept-images storage
 * bucket) into local JSON files under data/ so the dataset lives in the
 * repo and can be inspected/edited offline.
 *
 *   node scripts/pull-data.mjs            # tables only
 *   node scripts/pull-data.mjs --images   # tables + storage bucket download
 *
 * Env vars (also read from .env.local / .env if present):
 *   NEXT_PUBLIC_SUPABASE_URL        (required)
 *   SUPABASE_SERVICE_ROLE_KEY       (preferred; falls back to anon key)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY   (fallback)
 *   CFP_API_KEY                     (optional — snapshots CFP designs too)
 *
 * Uses the Supabase REST endpoints directly via fetch — no npm install
 * needed. Secret-looking app_settings rows (API keys) are never written
 * to disk.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(import.meta.dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const PAGE_SIZE = 1000;
const WANT_IMAGES = process.argv.includes('--images');

// Tables in FK-safe order (parents before children) — push-data.mjs
// reuses this ordering. `order` is the stable pagination sort column.
export const TABLES = [
  { name: 'profiles', order: 'id' },
  { name: 'concepts', order: 'id' },
  { name: 'concept_specs', order: 'concept_id' },
  { name: 'coil_specs', order: 'concept_id' },
  { name: 'base_specs', order: 'concept_id' },
  { name: 'concept_versions', order: 'id' },
  { name: 'comments', order: 'id' },
  { name: 'approval_logs', order: 'id' },
  { name: 'ai_generations', order: 'id' },
  { name: 'manufacturing_records', order: 'concept_id' },
  { name: 'concept_audit_log', order: 'id' },
  { name: 'spec_templates', order: 'id' },
  { name: 'share_links', order: 'id' },
  { name: 'brainstorm_ideas', order: 'id' },
  { name: 'app_settings', order: 'key' },
  { name: 'cfp_webhook_events', order: 'id' },
  { name: 'machines', order: 'id' },
  { name: 'production_schedule_days', order: 'id' },
  { name: 'production_jobs', order: 'id' },
  { name: 'production_logs', order: 'id' },
  { name: 'production_daily_reports', order: 'id' },
];

const SECRET_SETTING = /(key|token|secret|password)/i;
const STORAGE_BUCKET = 'concept-images';

export async function loadEnv() {
  // Merge .env.local / .env into process.env (Next.js does this for the
  // app; standalone scripts have to do it themselves).
  for (const file of ['.env.local', '.env']) {
    const p = path.join(ROOT, file);
    if (!existsSync(p)) continue;
    const text = await readFile(p, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  }
}

export function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error(
      'Missing Supabase credentials.\n' +
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or\n' +
      'NEXT_PUBLIC_SUPABASE_ANON_KEY) in the environment or in .env.local.'
    );
    process.exit(1);
  }
  return { url: url.replace(/\/$/, ''), key };
}

export function restHeaders(key) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function fetchTable(cfg, table) {
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const url = `${cfg.url}/rest/v1/${table.name}?select=*&order=${table.order}.asc&limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { headers: restHeaders(cfg.key) });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${body.slice(0, 200)}`);
    }
    const page = await res.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

async function listStorage(cfg, prefix = '') {
  // Recursively list the bucket. Folder entries come back with id === null.
  const files = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const res = await fetch(`${cfg.url}/storage/v1/object/list/${STORAGE_BUCKET}`, {
      method: 'POST',
      headers: restHeaders(cfg.key),
      body: JSON.stringify({ prefix, limit: PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } }),
    });
    if (!res.ok) throw new Error(`storage list failed: ${res.status} ${await res.text()}`);
    const entries = await res.json();
    for (const entry of entries) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        files.push(...(await listStorage(cfg, full)));
      } else {
        files.push({ path: full, size: entry.metadata?.size ?? null, updatedAt: entry.updated_at ?? null });
      }
    }
    if (entries.length < PAGE_SIZE) break;
  }
  return files;
}

async function downloadStorage(cfg, files) {
  let done = 0;
  for (const f of files) {
    const dest = path.join(DATA_DIR, 'storage', STORAGE_BUCKET, f.path);
    await mkdir(path.dirname(dest), { recursive: true });
    const res = await fetch(`${cfg.url}/storage/v1/object/${STORAGE_BUCKET}/${encodeURI(f.path)}`, {
      headers: restHeaders(cfg.key),
    });
    if (!res.ok) {
      console.warn(`  ! failed to download ${f.path}: ${res.status}`);
      continue;
    }
    await writeFile(dest, Buffer.from(await res.arrayBuffer()));
    done++;
    if (done % 25 === 0) console.log(`  … ${done}/${files.length} files`);
  }
  console.log(`  downloaded ${done}/${files.length} files`);
}

async function pullCfpDesigns() {
  const apiKey = process.env.CFP_API_KEY;
  if (!apiKey) return null;
  const base = process.env.CFP_API_BASE || 'https://customize-freezepipe-production.up.railway.app/api/external';
  try {
    const res = await fetch(`${base}/designs?limit=500`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn(`  ! CFP designs snapshot failed: ${err.message}`);
    return null;
  }
}

async function main() {
  await loadEnv();
  const cfg = getSupabaseConfig();
  await mkdir(path.join(DATA_DIR, 'tables'), { recursive: true });

  const manifest = {
    pulledAt: new Date().toISOString(),
    supabaseUrl: cfg.url,
    tables: {},
    storage: null,
    cfpDesigns: false,
  };

  for (const table of TABLES) {
    process.stdout.write(`pulling ${table.name} … `);
    try {
      let rows = await fetchTable(cfg, table);
      if (table.name === 'app_settings') {
        const before = rows.length;
        rows = rows.filter((r) => !SECRET_SETTING.test(r.key || ''));
        if (rows.length < before) {
          console.log(`(${before - rows.length} secret row(s) skipped) `);
        }
      }
      await writeFile(
        path.join(DATA_DIR, 'tables', `${table.name}.json`),
        JSON.stringify(rows, null, 2) + '\n'
      );
      manifest.tables[table.name] = rows.length;
      console.log(`${rows.length} rows`);
    } catch (err) {
      // Table may not be migrated yet — record and continue.
      manifest.tables[table.name] = `error: ${err.message}`;
      console.log(`SKIPPED (${err.message})`);
    }
  }

  // Always snapshot the storage file listing; only download bytes with --images.
  try {
    process.stdout.write(`listing storage bucket ${STORAGE_BUCKET} … `);
    const files = await listStorage(cfg);
    console.log(`${files.length} files`);
    await writeFile(
      path.join(DATA_DIR, 'storage-manifest.json'),
      JSON.stringify(files, null, 2) + '\n'
    );
    manifest.storage = { bucket: STORAGE_BUCKET, files: files.length, downloaded: WANT_IMAGES };
    if (WANT_IMAGES) await downloadStorage(cfg, files);
  } catch (err) {
    console.warn(`  ! storage listing failed: ${err.message}`);
  }

  const cfp = await pullCfpDesigns();
  if (cfp) {
    await mkdir(path.join(DATA_DIR, 'cfp'), { recursive: true });
    await writeFile(path.join(DATA_DIR, 'cfp', 'designs.json'), JSON.stringify(cfp, null, 2) + '\n');
    manifest.cfpDesigns = true;
    console.log('pulled CFP designs snapshot');
  }

  await writeFile(path.join(DATA_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`\nDone. Snapshot written to data/ (manifest: data/manifest.json)`);
}

// Allow push-data.mjs to import TABLES/helpers without running the pull.
if (process.argv[1] && import.meta.filename === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
