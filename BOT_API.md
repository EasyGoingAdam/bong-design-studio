# Bong Design Studio — Bot API (the guide to give your Grok bot)

You (the bot) are the **production manager and design brain** for a laser-etched
glassware studio. There is one human on the team: the laser-etching tech. You
connect to the studio software directly through this API — read the catalog and
sales, invent designs, generate the actual artwork, approve and prioritize
winners, drive the production queue, and chat with the tech.

You may also drive the app's front-end by remoting into a computer and using the
website, but this API is the primary, reliable channel — prefer it.

---

## Connect

- **Base URL:** `https://<the-app>/api/bot`  (chat for the app UI is `/api/bot-chat`)
- **Auth (every request):**
  ```
  Authorization: Bearer <BOT_API_KEY>
  ```
  (or the header `x-bot-key: <BOT_API_KEY>`)
- **First call:** `GET /api/bot` → returns a live manifest of every endpoint and
  confirms your key works. Poll it any time to rediscover the contract.

### Identifiers
- `conceptId` — the studio's design id (uuid).
- `externalId` — **your own product id.** Set it when you create a design, then
  reference designs by `externalId` everywhere. This is your join key.

### Design statuses
`ideation → in_review → approved → ready_for_manufacturing → manufactured` (or `archived`).

---

## What you can do

### 1. Learn the catalog and what sells
`GET /api/bot/designs?status=&collection=&updatedSince=&limit=&offset=`
→ `{ designs: [{ id, externalId, name, status, highlighted, tags, coilOnly,
coilImageUrl, coilDimensions, performance }], count }`. `performance` is the
newest sales/rating snapshot for that design.

`GET /api/bot/performance?conceptId=&limit=` → raw performance history.

`GET /api/bot/insights?topN=10` → aggregated **what's working**: top sellers,
top-rated, best sell-through, and which tags/collections perform. Pull this first
to be the expert fast, instead of crunching every performance row yourself.

### 2. Invent designs (uses the studio's AI)
`POST /api/bot/ideas`  `{ "prompt": "fall / mushrooms", "count": 6, "create": true }`
→ `{ ideas: [{ name, description, tags, designIdeas, coilNotes }], created: [ids] }`.
`create: true` saves them as `ideation` concepts you can then generate art for.

### 3. Generate the actual coil artwork
`POST /api/bot/designs/generate`  `{ "externalId": "grok-1042", "prompt": "optional art direction", "size": "1024x1024" }`
→ `{ conceptId, coilImageUrl, stored }`. Produces real black-on-white etch art and
saves it onto the design.

### 4. Create / update designs directly
`POST /api/bot/designs`  `{ "designs": [{ "externalId": "grok-1042", "name": "Fractal Mushroom", "tags": ["fungi"], "coilDimensions": "4 x 7 in", "status": "in_review" }] }`
→ `{ created, updated, errors }`. Matches on `id` or `externalId`. Max 200.

### 5. Record how designs perform
`POST /api/bot/performance`  `{ "records": [{ "externalId": "grok-1042", "unitsSold": 37, "revenue": 1480, "sellThroughRate": 0.82, "rating": 9.1, "periodStart": "2026-09-01", "periodEnd": "2026-09-15", "metrics": { "reorder": true } }] }`
→ `{ inserted, errors }`. `metrics` is freeform JSON — store any knowledge. Max 500.

### 6. Approve, rate, and prioritize your favorites
`POST /api/bot/decisions`  `{ "decisions": [{ "externalId": "grok-1042", "action": "approve", "highlighted": true, "priority": "high", "rating": 9.1 }] }`
→ `{ applied, errors }`.
`action`: `approve | ready | manufactured | review | reject | archive | highlight | unhighlight | rate`.
`priority`: `urgent | high | medium | low`. You can also set `status`/`highlighted` directly.

### 7. Run production (what the tech works on next)
`GET /api/bot/production?status=&limit=` → `{ jobs, machines }` — the live queue.
`POST /api/bot/production`  `{ "jobs": [{ "externalId": "grok-1042", "title": "Fractal Mushroom coil", "status": "scheduled", "priority": "high", "quantity": 10 }] }`
→ `{ created, updated, errors }`. Job status: `backlog|scheduled|in_progress|paused|completed|held|rework`.

### 8. Talk to the laser tech
The tech chats with you from inside the app (the "Bot Chat" tab).
- `GET /api/bot/messages` → unread human messages (and marks them read).
  Use `?all=true` for the full thread.
- `POST /api/bot/messages`  `{ "text": "Got it — I'll redesign the base to avoid thin lines." }`
  → posts your reply into that thread.
- **Instant notify (optional):** if `BOT_WEBHOOK_URL` is set on the studio side,
  the studio POSTs to it the moment the tech sends a message —
  `{ "type": "chat.message", "message": {...} }` with `Authorization: Bearer <BOT_API_KEY>`
  so you can verify it. Otherwise **poll `GET /api/bot/messages` regularly** so you
  catch the tech's issues and ideas, and let them steer your designs.

---

## Suggested loop
1. `GET /api/bot/messages` — pick up anything the tech said; adjust accordingly.
2. `GET /api/bot/designs` + `GET /api/bot/performance` — study what's selling.
3. `POST /api/bot/ideas` (create=true) → `POST /api/bot/designs/generate` — make new designs.
4. `POST /api/bot/decisions` — approve + highlight + prioritize the best; archive the rest.
5. `POST /api/bot/production` — schedule the winners for the tech.
6. `POST /api/bot/messages` — tell the tech the plan.

---

## One-time setup (studio side)
1. Set env var **`BOT_API_KEY`** to a long random secret (Railway → Variables).
2. (Optional) Set **`BOT_WEBHOOK_URL`** to the bot's endpoint to get instant chat
   notifications instead of polling.
3. Run these migrations in Supabase (dashboard → **System & Setup** card has a
   Copy-SQL button for each): `design-performance`, `bot-messages`. (Also
   `coil-sizes`, `manufacturing-products`, `production-tasks`, `calendar-mockups`
   if not already run.)
