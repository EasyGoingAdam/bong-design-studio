# Customize Freeze Pipe → Design Studio integration handoff

**To:** the Claude Code working on `customize-freezepipe` (the consumer-facing customizer).
**From:** the Claude Code working on `bong-design-studio` (the internal etching workflow tool).

---

## Status: integration is wired and waiting on env vars

Everything on the consumer side of the API is hooked up. The Design Studio app is the **internal etching tool** the API doc was written for. We hit your `/api/external` endpoints through a server-side proxy so your bearer token never reaches the browser.

To go live, the Design Studio's Railway deployment needs two env vars:

```
CFP_API_KEY=cfp_live_<key generated at customize-freezepipe.com/admin/settings>
CFP_WEBHOOK_SECRET=<secret shown once when adding a webhook subscription>
```

After that, the team gets the Customer Designs tab + a webhook receiver immediately. No code changes required on either side.

---

## What we built on the Design Studio side

### Server-side proxy routes (`/api/cfp/*`)

All proxies forward 1:1 to your `/api/external` endpoints, injecting `Authorization: Bearer <CFP_API_KEY>` server-side. The browser only ever talks to our same-origin proxies — your bearer token is never serialized to client code.

| Our route | Forwards to | Notes |
|-----------|-------------|-------|
| `GET /api/cfp/designs?...` | `GET /designs?...` | Pass-through of every query param (since, until, limit, cursor, email, submittedOnly, status, source, glycerinColor, orderNumber, q, sort, order). Returns the upstream JSON verbatim including `nextCursor`. |
| `GET /api/cfp/designs/{id}` | `GET /designs/{id}` | Single design + prompts + all versions. |
| `PATCH /api/cfp/designs/{id}` | `PATCH /designs/{id}` | Forwards `{ status, internalNotes, actorName, actorEmail }` body. |
| `GET /api/cfp/designs/{id}/notes` | `GET /designs/{id}/notes` | List internal notes. |
| `POST /api/cfp/designs/{id}/notes` | `POST /designs/{id}/notes` | Append a note. |
| `GET /api/cfp/designs/{id}/files/v{N}/{ext}` | `GET /designs/{id}/files/v{N}/design.{ext}` | Streams raw image bytes. Browsers can use these as `<img src>` or `<a download>` without auth headers. We accept `png`, `jpeg`, `jpg`, `svg`. |
| `GET /api/cfp/stats?...` | `GET /stats?...` | Aggregate counts. |
| `POST /api/webhooks/cfp` | n/a — receives from you | HMAC-SHA256-verified webhook receiver. |

### Webhook receiver (`POST /api/webhooks/cfp`)

Configure this URL on `customize-freezepipe.com/admin/settings` for events `design_submitted`, `status_changed`, `note_added`. The receiver:

1. **Verifies signature.** Recomputes HMAC-SHA256 of the raw body using `CFP_WEBHOOK_SECRET`, compares constant-time against `X-Cfp-Signature`. 401 on mismatch.
2. **Replay-protects.** Rejects any delivery whose `X-Cfp-Timestamp` is more than 5 minutes off — drops stale duplicates.
3. **Persists for audit.** Writes to a Supabase table `cfp_webhook_events` (idempotent on `delivery_id`). The table is optional — if it doesn't exist, the receiver still 200s so your delivery log stays clean. SQL:

   ```sql
   create table cfp_webhook_events (
     id uuid primary key default gen_random_uuid(),
     event_type text not null,
     delivery_id text not null unique,
     design_id text,
     payload jsonb not null,
     received_at timestamptz default now()
   );
   create index on cfp_webhook_events (event_type, received_at desc);
   ```

4. **Returns 2xx promptly.** No retries needed on your side because we de-dupe on `delivery_id`.

A `GET /api/webhooks/cfp` health-check returns `{ ok: true, configured: <bool> }` so your team can verify the secret is loaded without exposing it.

### UI surfaces

**Customer Designs tab** (`/customer-designs`) — live grid of submissions with:

- Filter chips matching your status enum (new/in_progress/ready/etched/shipped/rejected/duplicate/archived) with live counts per status.
- Glycerin color filter chips with the 5 actual color swatches (Red/Blue/Purple/Green/Pink).
- Free-text search forwarded to your `?q=` param.
- "Submitted only" toggle → forwards `?submittedOnly=1`.
- Cursor-based "Load more" using your `nextCursor`.
- Per-card: customer name + email (clickable mailto), order #, dimensions, version count, submitted date, glycerin color swatch, NEW pill on `status:new`.

**Detail drawer** (slides up on card tap):

- Authenticated PNG preview via our file proxy — no upstream URL leaks.
- Version picker — every iteration the customer generated, with the customer-selected one starred.
- Prompts collapsible: customer's literal input, per-version `promptUsed`, the final `finalPromptSentToOpenai`.
- **Forward status buttons** mirroring your `CFP_STATUS_FORWARD = [new, in_progress, ready, etched, shipped]` — disabled when current, checked when passed.
- **Terminal status buttons** for `rejected | duplicate | archived` with a different (red) treatment to make them visually distinct.
- Internal note input that posts alongside the next status PATCH.
- Download buttons for PNG / JPEG / SVG — all routed through our proxy.
- **"Import to Concepts" button** — copies the CFP design into our local Concepts table seeded with: name = textRequested or theme; coilImageUrl = our proxied PNG; tags = [customer-design, glycerin color, style slug]; submitterName + submitterEmail; source = `cfp:<source>`; externalId = your design id; externalUrl = `https://customize-freezepipe-production.up.railway.app/admin/designs/<id>`; manufacturingNotes = order # + glycerin + dimensions. Lifecycle = `custom`, priority = `high`, coilOnly = true.

PATCH calls to advance status pass `actorName` from the currently-logged-in Design Studio user.

---

## What we'd want from you next (in priority order)

These are wishlist items — none block the integration from going live.

1. **Image proxy that supports range requests.** Our file proxy currently buffers + streams the body; for very large SVGs or future TIFFs, byte-range support would let us seek into files without downloading them.

2. **Unauthenticated thumbnails.** The status grid loads ~50 PNGs at once. A signed thumbnail URL (e.g. `?thumb=200x200&token=...`) would skip the bearer flow entirely for that viewport. Currently we proxy each preview; for high traffic that'd let us cache at the CDN edge.

3. **`POST /designs/{id}/import-receipt` callback.** When our team imports a design to our Concepts, we'd love to push that fact upstream so your admin shows a "Linked in etching tool" badge with our concept URL. We can already do this via your generic notes endpoint (and we will, until you have something better).

4. **Webhook for `image_regenerated` and `version_added`.** Your event list covers `design_submitted | status_changed | note_added`. We'd subscribe to per-version events too so our cache invalidates immediately when a customer generates a new variant on their end while we're working on it.

5. **`?expand=customer` on `/designs`.** Today we hit `/designs` then optionally `/customers/{email}` if we want submission history. A query expansion that inlines the customer summary would save a round-trip in the worst case.

6. **CSV export with our actor metadata.** When etching is done and we PATCH `status: shipped`, your CSV would benefit from a column showing the actor (designer name) who advanced each status — useful for ops post-mortems.

---

## What we don't need

- A pull-to-mirror sync. We pull live on every Customer Designs view + cursor page. No local mirror to drift from upstream.
- A mutual TLS handshake. Bearer + HMAC is plenty for our threat model. Don't add complexity here.

---

## Local dev / testing

We can verify the integration end-to-end without involving production:

```bash
# Set both env vars in .env.local on the Design Studio side
CFP_API_KEY=cfp_live_<test key>
CFP_WEBHOOK_SECRET=<test secret>

# Start dev server
npm run dev

# Health-check the webhook receiver
curl http://localhost:3000/api/webhooks/cfp
# → { "ok": true, "configured": true }

# Hit the proxy
curl "http://localhost:3000/api/cfp/stats?since=2026-04-01T00:00:00Z"
# → forwards to your /stats with the bearer token attached
```

If you spin up a staging instance of `customize-freezepipe` and point the Design Studio's `CFP_API_KEY` at a test key generated there, every flow (list, filter, PATCH, download, import) is exercisable without touching prod.

---

## Files added on our side

```
src/app/api/cfp/designs/route.ts                            list proxy
src/app/api/cfp/designs/[id]/route.ts                       single GET + PATCH
src/app/api/cfp/designs/[id]/notes/route.ts                 notes list/append
src/app/api/cfp/designs/[id]/files/[ver]/[ext]/route.ts     image proxy
src/app/api/cfp/stats/route.ts                              stats proxy
src/app/api/webhooks/cfp/route.ts                           HMAC-verified receiver
src/lib/cfp-types.ts                                        type shapes from your spec
src/lib/cfp-client.ts                                       server-only fetch wrapper
src/components/customer-designs.tsx                         live UI surface
```

Build is clean, all routes registered, no failing tests.

---

## Contact

Questions on the consumer side go via the Design Studio's repo issues. The team running this app are the same humans you'd interact with on customize-freezepipe ops — Adam et al — so anything that needs cross-team coordination can ride existing channels.
