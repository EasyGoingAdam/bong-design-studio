# Incoming Submissions API

Push a finished design from an external tool into Design Studio as a new
concept for the team to work on.

## Endpoint

```
POST https://<YOUR_APP_URL>/api/incoming/concept
```

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

All fields are optional except `name`. Minimal valid request:

```json
{
  "name": "Dragon — Mirror Symmetric"
}
```

### Full schema

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
  "status": "ideation",
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

1. The concept lands in the **Ideation** column of the workflow board
2. A purple `↓ <source>` badge shows up on its card so the team knows
   it's external
3. The concept detail page shows a dedicated "External Submission" card
   in the sidebar with the submitter's name, email, external ID, and a
   clickable link back to your tool
4. The team runs the full pipeline (review, edit, mockup, marketing) as
   they would for any concept
5. The external submission metadata (source, externalId, submitter info)
   persists forever so you can always trace it back

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
