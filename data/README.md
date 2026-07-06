# Local data snapshot

This directory is the local, git-committed copy of the Bong Design Studio
dataset that normally lives in Supabase. It exists so the data can be read
and edited from this repo (including in ephemeral Claude Code cloud
sessions, where anything not committed to git is lost).

## Layout

- `tables/<table>.json` — one JSON array per Supabase table, exactly as the
  REST API returns the rows (snake_case column names).
- `storage-manifest.json` — file listing of the `concept-images` storage
  bucket (paths, sizes). Image bytes are only downloaded with `--images`
  and are **not** committed (see `.gitignore`) — the JSON rows keep their
  public Supabase URLs, so images stay viewable either way.
- `cfp/designs.json` — snapshot of customer designs from the CFP API
  (only written when `CFP_API_KEY` is available).
- `manifest.json` — when the snapshot was taken, from which Supabase
  project, and the row count per table.

## Workflow

```bash
npm run data:pull             # Supabase -> data/  (add -- --images to also download the bucket)
# ... edit data/tables/*.json ...
npm run data:push             # data/ -> Supabase (upsert; never deletes)
npm run data:push -- concepts # push a single table
```

Required env vars (in the shell, in `.env.local`, or in the Claude Code
environment settings):

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (preferred; `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  works for pulling only if RLS allows it)
- `CFP_API_KEY` (optional, for the CFP designs snapshot)

## Safety notes

- `app_settings` rows whose key looks like a secret (`*key*`, `*token*`,
  `*secret*`, `*password*` — e.g. the stored OpenAI/Gemini keys) are
  **never exported**, so nothing sensitive lands in git.
- `data:push` only upserts by primary key. Deleting a row from a JSON file
  does not delete it in Supabase.
- Re-running `data:pull` overwrites local files — commit or push local
  edits first.
