# Incoming Submissions API

> ## ⏸ SHELVED
>
> This feature is currently **disabled** at the server. The endpoint returns
> HTTP `410 Gone` for all callers. The implementation, schema, UI surfacing,
> and SQL migrations are kept intact in the repo so re-enabling is a
> one-line config change later.
>
> **To turn it back on:**
> 1. Set `INCOMING_API_ENABLED=true` in Railway → Variables
> 2. Set `INCOMING_API_KEY` to a strong shared secret (`openssl rand -hex 32`)
> 3. Run the SQL migration in `supabase-migration-submissions.sql` (only if not already run)
> 4. Redeploy
>
> Everything below describes the contract as it WILL behave when re-enabled.

---

Push a finished design from an external tool into Design Studio as a
ready-to-work-on concept. Submissions land directly in the **Approved**
column so the team can take them straight to manufacturing.

## Endpoint

```
POST https://<YOUR_APP_URL>/api/incoming/concept
```

## Minimal call — the common case

A customer finishes a design in your tool, you push it in:

```bash
curl -X POST "https://YOUR_APP/api/incoming/concept" \
  -H "Authorization: Bearer YOUR_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "graphic": "data:image/png;base64,iVBORw0KGgo...",
    "name":    "Customer Dragon Design",
    "email":   "alex@example.com"
  }'
```

That's it. The concept:

- Lands in the **Approved** column (ready for manufacturing prep)
- Is marked **coil-only** (single graphic = coil design)
- Uses the graphic as its coil image (uploaded to our Storage if base64)
- Shows a purple `↓ <source>` badge on its workflow card
- Displays an "External Submission" card in its sidebar with the email
  and a clickable link back to your tool (if you pass `externalUrl`)
- Can be edited by the team like any other concept

## Authentication

Bearer token in the `Authorization` header. Set `INCOMING_API_KEY` as an
environment variable on the server (Railway → Variables) and share the
same value with whatever client is calling this endpoint.

```
Authorization: Bearer <your-shared-secret>
```

**Generate a secure value** (paste into Railway):

```bash
openssl rand -hex 32
```

If `INCOMING_API_KEY` is missing server-side, the endpoint returns `503`
and refuses all requests. Fail-closed by design.

## Health check

`GET /api/incoming/concept` with the same Bearer header. Returns `{ ok: true }`
when auth is valid and the endpoint is live. Use this from your external
tool to verify connectivity before shipping real submissions.

## Request body

All fields optional except **name** (or its alias `designName`).

### Simplified shape (recommended)

| Field           | Type                 | Notes                                                                                           |
|-----------------|----------------------|-------------------------------------------------------------------------------------------------|
| `graphic`       | string               | The main design image. Either `https://...` or `data:image/png;base64,...` — we auto-detect.    |
| `graphicUrl`    | string               | Explicit URL form                                                                               |
| `graphicBase64` | string               | Explicit base64 data-URI form                                                                   |
| `name`          | string **(required)**| Design name — shown on the concept card                                                         |
| `designName`    | string               | Alias for `name`                                                                                |
| `email`         | string               | Customer's email — shown as submitter contact                                                   |
| `submitterName` | string               | Customer's display name (falls back to email, then "External Submission")                       |
| `externalId`    | string               | Your tool's ID for this design — enables idempotent re-pushes                                   |
| `externalUrl`   | string               | Deep link back to the design in your tool (clickable from the concept sidebar)                  |
| `source`        | string               | Your tool's name (e.g. `custom-designer-v1`) — shown as the purple source badge                 |

Single-graphic submissions are automatically marked **coil-only** (no
separate base piece) unless the caller overrides with `coilOnly: false`
AND provides a `baseImageUrl`/`baseImageBase64`.

### Full schema (for callers that track more metadata)

| Field              | Type                       | Notes                                                                                  |
|--------------------|----------------------------|----------------------------------------------------------------------------------------|
| `name`             | string **(required)**      | The concept name shown in the studio                                                   |
| `description`      | string                     | Long-form description                                                                  |
| `collection`       | string                     | Optional grouping (e.g. "Winter 2026")                                                 |
| `tags`             | string[]                   | Search tags                                                                            |
| `intendedAudience` | string                     | Audience / vibe description                                                            |
| `priority`         | `low` \| `medium` \| `high` \| `urgent` | Defaults to `medium`                                                      |
| `lifecycleType`    | `seasonal` \| `evergreen` \| `limited_edition` \| `custom` | Defaults to `evergreen`                         |
| `coilOnly`         | boolean                    | `true` if the design has no base piece; defaults to `false`                            |
| `coilImageUrl`     | string                     | Public http(s) URL to the coil/sleeve image                                            |
| `coilImageBase64`  | string                     | `data:image/png;base64,...` — we upload to our own storage                             |
| `baseImageUrl`     | string                     | Public http(s) URL to the base image (ignored when `coilOnly` is true)                 |
| `baseImageBase64`  | string                     | `data:image/png;base64,...` — ignored when `coilOnly` is true                          |
| `source`           | string                     | Identifier for your tool (e.g. `custom-designer-v1`). Required for idempotency.        |
| `externalId`       | string                     | Your tool's ID for this design. **Required for idempotency** — see below.              |
| `externalUrl`      | string                     | Deep link back to the design in your tool                                              |
| `submitterEmail`   | string                     | End-user who designed it                                                               |
| `submitterName`    | string                     | End-user's display name (becomes the concept's `designer` field)                       |
| `notes`            | string                     | Free text that lands in the concept's Manufacturing Notes field                        |
| `dimensions`       | object                     | `{ overallW, overallH, coilW, coilH, baseW, baseH, unit }` — unit is `mm` or `in`      |
| `status`           | string                     | **Defaults to `approved`.** Override with `ideation` / `in_review` / `approved` / `ready_for_manufacturing` |

### Image handling

Provide EITHER a URL or a base64 data-URI for each image. If you provide
base64, we upload it to our own Supabase Storage and persist the resulting
public URL on the concept — the design survives even if your tool's URL
goes away. URLs are stored verbatim (no re-hosting).

If you provide both, the URL wins.

### Idempotency

Send the same `(source, externalId)` pair again and the endpoint
**UPDATES** the existing concept instead of creating a duplicate. Use this
to safely retry failed requests or to push updates when the customer
edits their design.

Without `externalId`, every submission creates a new concept.

## Response

### 201 Created (first submission)

```json
{
  "id": "4e8c2a9f-...",
  "url": "https://<your-app>/?conceptId=4e8c2a9f-...",
  "status": "approved",
  "coilOnly": true,
  "created": true,
  "createdAt": "2026-04-24T21:30:00.000Z",
  "updatedAt": "2026-04-24T21:30:00.000Z"
}
```

### 200 OK (idempotent replay)

Same shape but `"created": false`.

### 4xx / 5xx errors

```json
{ "error": "human-readable reason" }
```

Status codes:

- `400` — malformed JSON or missing `name`
- `401` — missing or wrong Bearer token
- `500` — image upload failed, database insert failed
- `503` — `INCOMING_API_KEY` not set on the server

## Example — minimal

```bash
curl -X POST "https://YOUR_APP/api/incoming/concept" \
  -H "Authorization: Bearer YOUR_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Dragon Design",
    "source": "custom-designer-v1",
    "externalId": "design-8af3c",
    "coilImageUrl": "https://yourtool.cdn/renders/8af3c-coil.png",
    "coilOnly": true,
    "submitterEmail": "alex@example.com",
    "submitterName": "Alex K",
    "tags": ["dragon", "symmetric"],
    "priority": "high"
  }'
```

## Example — full

```bash
curl -X POST "https://YOUR_APP/api/incoming/concept" \
  -H "Authorization: Bearer YOUR_SHARED_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Elm Forest Mandala",
    "description": "Radial mandala with elm-leaf motifs, Art Nouveau influence",
    "collection": "Fall 2026",
    "tags": ["mandala", "botanical", "radial", "nouveau"],
    "intendedAudience": "Design-forward customers who care about provenance",
    "priority": "high",
    "lifecycleType": "limited_edition",
    "coilOnly": false,
    "coilImageUrl": "https://yourtool.cdn/renders/elm-forest-coil.png",
    "baseImageUrl": "https://yourtool.cdn/renders/elm-forest-base.png",
    "source": "custom-designer-v1",
    "externalId": "design-elm-forest-v3",
    "externalUrl": "https://yourtool.app/designs/elm-forest-v3",
    "submitterEmail": "customer@example.com",
    "submitterName": "Maya R",
    "notes": "Customer wants 0.4mm minimum line weight — confirmed with etch team.",
    "dimensions": {
      "overallW": 140, "overallH": 180,
      "coilW": 120, "coilH": 60,
      "baseW": 65, "baseH": 65,
      "unit": "mm"
    }
  }'
```

## What happens after submission

1. The concept lands in the **Approved** column of the workflow board —
   ready for the team to take to manufacturing. (Override with the
   optional `status` field if you want it elsewhere.)
2. Automatically marked **coil-only** when you pass a single `graphic`
   — the base column is hidden in the UI and skipped in generation.
3. A purple `↓ <source>` badge shows up on its workflow card so the
   team instantly spots external submissions.
4. The concept detail page shows a dedicated "External Submission" card
   in the sidebar with the submitter's name, email, external ID, and a
   clickable **Open in source tool** link back to `externalUrl`.
5. The team can edit everything — name, tags, description, priority,
   specs, manufacturing notes — like any internally-created concept.
6. The external submission metadata persists forever so you can always
   trace a shipped product back to the original design.

## Outbound webhooks (future)

Not built yet. If you want Design Studio to notify your tool when the
concept changes status (e.g. "your design is in production"), open a
request and we can add outbound webhooks in a follow-up.

## Security notes

- The bearer token is a shared secret — rotate it via Railway Variables
  if it ever leaks; all in-flight requests with the old token will start
  returning `401`.
- We do NOT send the `INCOMING_API_KEY` to the browser — only the server
  checks it.
- Uploaded images go into the `concept-images` bucket with the same
  Supabase Storage ACLs as every other concept image.
