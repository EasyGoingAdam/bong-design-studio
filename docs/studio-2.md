# Bong Design Studio 2.0

A simplified, single-workspace experience for producing laser-etch artwork.
An employee describes a design, picks the product and detail, and gets
production-ready binary black/white files — without touching AI models, prompt
engineering, thresholds, aspect ratios, or file prep.

**Workflow:** Describe → Product/Area → Shape → Detail → Generate → Refine → Export.

## Where it lives in the app

Top-right mode switch: **Design · Advanced · Production**.
- **Design** (default) — the 2.0 studio (`src/components/design-studio.tsx`).
- **Advanced** — the full legacy 19-tab studio, kept intact (nothing deleted).
- **Production** — the shop-floor cockpit.

The mode is remembered per browser. Everything from before still works under
Advanced; 2.0 is additive and isolated.

## One-time setup

Run the migration once: **Dashboard → System & Setup → "Studio 2.0 tables" →
Copy SQL → run in Supabase** (`supabase-migration-studio-2.sql`). It creates the
new tables and seeds a few product templates. It touches nothing existing.

Admins add more products via **⚙ Products** in the Design header (name, area,
dimensions, wrap/seamless, and an optional product photo that enables previews).

## Data model (new, separate tables)

- **product_templates** — one row per (product, design area): physical size,
  aspect ratio, wrap/seamless, optional product photo. The picker's source.
- **design_projects** — a design (single or coordinated set): the plain request,
  refined prompt, product, status (draft/favorite/approved/produced/archived).
- **design_targets** — where artwork goes (Coil, Base, …): shape, wrap, seamless,
  detail level, etch coverage, physical size, and a pointer to the current version.
- **design_versions** — every generate / edit / reverse is a version: the hidden
  production prompt, the binary master image, black coverage, provider, parent.

These are independent of the legacy `concepts` tables, so bots, archive,
production and existing designs are untouched.

## The pipeline (binary, scoped to 2.0 only)

```
describe + choices
      │  buildEtchingPrompt()  — src/lib/etching-prompt.ts
      ▼  (mandatory engraving rules + detail/shape/wrap/coverage/dims/set brief)
   AI raw image   — src/lib/studio-server.ts (gpt-image-2 → v1 fallback)
      │  toProductionMaster()  — src/lib/production-master.ts
      ▼  TRUE 1-bit black/white (default threshold 128, admin/env only)
   validateEtchingArtwork()  — monochrome/binary/black-coverage + warnings
      ▼
   store master  →  design_version  →  target.current_version
```

The shared `/api/generate-image` path (bots, calendar, legacy studio) keeps its
grayscale enforcement — binary is exclusive to the 2.0 endpoints below.

Threshold is a calibration value: a system default, overridable by
`ETCH_MONO_THRESHOLD` — never a user-facing slider. Artists choose
Simple/Balanced/Intricate; engineers own thresholding.

## Endpoints

| Route | Purpose |
|---|---|
| `GET/POST/DELETE /api/product-templates` | list / create-update / remove templates |
| `GET/POST /api/studio/projects` | archive list / create a project + targets |
| `GET/PATCH /api/studio/projects/[id]` | full project (targets + versions) / status |
| `POST /api/studio/generate` | generate/regenerate a target (fresh) |
| `POST /api/studio/edit` | **Edit With AI** — image-to-image on the current version |
| `POST /api/studio/reverse` | instant black↔white invert (no AI), new version |
| `POST /api/studio/restore` | make an older version current again |
| `GET /api/studio/export` | download SVG (true vector) / PNG / JPG |

## Features

- **Help Me Brainstorm** — reuses `/api/brainstorm`; click an idea to fill the description.
- **Coordinated sets** — pick Coil + Base and both share a design-family brief.
- **Regenerate / Edit With AI / Reverse** — Edit refines the actual pixels; Reverse is instant.
- **Version history + restore** — every step is a version; restore is non-destructive.
- **Export** — SVG is a **true vector trace** (Potrace → real paths, no embedded
  raster; falls back to embedded-image SVG and labels it). PNG/JPG from the master.
  "Download All" writes `name.svg/.png/.jpg` with human-readable names.
- **Archive** — visual project library with search + single/set filter.
- **Preview on Product** (secondary) — reuses the color mockup route; requires a
  product photo. Never required to export.

## Boundaries

- Design art is binary black/white. **Product mockups and marketing graphics stay
  full color** — they are not run through the binary pipeline.
- Old functionality remains under Advanced; nothing was deleted. Cleanup
  (retiring redundant screens) is a later, deliberate step.

## Tests

`npm run test:studio` — production master (binary), validator, prompt builder,
and vector tracing. `npm run test:monochrome` — the shared monochrome floor.
