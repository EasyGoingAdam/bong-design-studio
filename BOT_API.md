# Bot API — for the Grok bot

A bulk read/write API so an external bot (Grok) can become the expert on what
laser-etched designs sell: read every design + its specs + performance, create
designs, record sales/ratings, and approve favorites — all in bulk.

## Setup (one time)

1. Set an environment variable **`BOT_API_KEY`** to a long random secret
   (Railway → Variables). This is the only credential the bot needs.
2. Run the migration **`supabase-migration-design-performance.sql`** in Supabase
   (or use the dashboard → System & Setup card → "Bot performance table" → Copy SQL).

Base URL: `https://<your-app>/api/bot`

## Auth

Every request sends the key as either header:

```
Authorization: Bearer <BOT_API_KEY>
# or
x-bot-key: <BOT_API_KEY>
```

`GET /api/bot` returns the live manifest and doubles as an auth/ping check.

## Identifiers

- `conceptId` — this app's design id (uuid).
- `externalId` — **the bot's own product id.** Set it when creating/updating a
  design, then reference designs by `externalId` everywhere. This is the join key
  between the bot's world and ours.

## Endpoints

### `GET /api/bot/designs` — bulk export (read everything)
Query: `status`, `collection`, `updatedSince` (ISO), `limit` (≤500, default 100), `offset`.
```bash
curl -s "$BASE/designs?status=approved&limit=200" -H "Authorization: Bearer $KEY"
```
Returns `{ designs: [{ id, externalId, name, status, highlighted, tags,
coilOnly, coilImageUrl, coilDimensions, ..., performance }], count, limit, offset }`.
`performance` is the newest recorded snapshot for that design.

### `POST /api/bot/designs` — bulk create / update (make products)
Matches on `id` or `externalId`; otherwise inserts. Max 200 per call.
```bash
curl -s -X POST "$BASE/designs" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "designs": [
    { "externalId": "grok-1042", "name": "Fractal Mushroom", "tags": ["psychedelic","fungi"],
      "coilImageUrl": "https://…/art.png", "coilDimensions": "4 x 7 in", "status": "in_review" }
  ]
}'
```
Returns `{ created, updated, errors }` (arrays of ids).

### `POST /api/bot/performance` — bulk record sales / ratings
Max 500 per call. Reference each record by `conceptId` or `externalId`.
```bash
curl -s -X POST "$BASE/performance" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "records": [
    { "externalId": "grok-1042", "unitsSold": 37, "revenue": 1480.00,
      "sellThroughRate": 0.82, "rating": 9.1, "periodStart": "2026-09-01",
      "periodEnd": "2026-09-15", "metrics": { "returns": 1, "reorder": true } }
  ]
}'
```
`metrics` is freeform JSON — store any laser-etch knowledge you want. Returns `{ inserted, errors }`.

### `GET /api/bot/performance` — read recent performance
Query: `conceptId?`, `limit` (≤1000). Returns `{ records }`.

### `POST /api/bot/decisions` — bulk approve / rate / highlight / archive
Max 500 per call.
```bash
curl -s -X POST "$BASE/decisions" -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d '{
  "decisions": [
    { "externalId": "grok-1042", "action": "approve", "highlighted": true, "rating": 9.1 }
  ]
}'
```
`action`: `approve` | `ready` | `manufactured` | `review` | `reject` | `archive` |
`highlight` | `unhighlight` | `rate`. You can also set `status` and `highlighted`
directly, and pass a `rating` (recorded to the performance log). Returns `{ applied, errors }`.

## Typical loop for the bot

1. `GET /api/bot/designs` → learn the catalog + past performance.
2. Pull Shopify sales, compute performance → `POST /api/bot/performance`.
3. Generate/curate new designs → `POST /api/bot/designs` (with your `externalId`).
4. `POST /api/bot/decisions` → approve + highlight the winners, archive the duds.
