# price-track — Agent Reference

## Stack
- React + Vite frontend, PocketBase 0.22.22 backend, single Docker container
- Node.js worker (runs inside same container) — Playwright scraping + Claude CLI AI + scheduled checks
- Auth: Cloudflare Access → cfAuth sidecar auto-creates PB users and injects token into localStorage. No login form needed.

## Realtime (SSE) — read before debugging "live updates not working"
The UI relies on PocketBase realtime (SSE) for live updates — e.g. the "Check All" button is
fire-and-forget and depends entirely on realtime to show spinners (`is_scraping`) and updated
prices/`last_checked`. Per-retailer scrape works WITHOUT realtime (it does an explicit refetch),
so "per-retailer updates but Check All doesn't" = realtime is broken.

Three things must all be right for realtime through cf-auth + nginx (full detail in
`cfAuth/CLAUDE.md` Lesson #8):
1. **Frontend** (`frontend/src/main.jsx`): re-hydrate `pb.authStore` from the `pocketbase_auth`
   localStorage key via `authStore.save()` on boot. The cfAuth sidecar writes that key directly,
   which does NOT fire `authStore.onChange`, so the realtime client otherwise submits its
   subscription POST unauthenticated → server applies the collection `viewRule`
   (`user = @request.auth.id`) and silently drops every event.
2. **cfAuth `/validate`**: must accept the `CF_Authorization` cookie (EventSource can't send the
   `Cf-Access-Jwt-Assertion` header).
3. **nginx**: `sub_filter_types` must be `text/html` (not `*`) so it doesn't buffer the
   event-stream; price-track also has a dedicated `location = /api/realtime` block.

**A "cancelled / 15s Initial connection" symptom on ONE machine (e.g. work laptop on a corporate
VPN) but fine on phone/other networks is the VPN breaking SSE — not the server.** Test from a
second network before touching any config.

## Deployment
Rebuild and redeploy:
```sh
docker compose up -d --build price-track
```

## Collections
- `products` — tracked products (name, url, image_url, brand, model, description, category)
- `retailers` — retailer entries per product (name, url, selector, enabled, last_price, last_checked)
- `price_history` — price snapshots (retailer, product, price, currency, in_stock)
- `alerts` — price alert rules (product, condition: below/above/any_change/any_drop, target_price)
- `notification_channels` — notification config (type: pushbullet/webhook/email, config JSON)
- `users` — auth collection

## Worker API (proxied through nginx at /api/price-track/)
- `POST /api/price-track/scrape` — trigger scrape for a retailer_id
- `POST /api/price-track/detect-selector` — AI-detect CSS selector for a URL
- `POST /api/price-track/fetch-meta` — AI-fetch product metadata from URL/query
- `POST /api/price-track/find-retailers` — AI-find Australian retailers for a product
- `POST /api/price-track/test-notification` — send test notification for a channel_id
- `POST /api/price-track/check-all` — trigger full check run (optional `product_id` body param to limit to one product)

## Adding a New Notifier
1. Create `worker/src/notifiers/<type>.js` — export `async function send(config, notification)`
2. Register in `worker/src/notifiers/index.js` → `NOTIFIERS` map
3. Add the type via a JS migration (update the `notification_channels` select field options)
4. Add UI fields in `frontend/src/pages/Settings.jsx` → `CHANNEL_TYPES`

## Schema Changes — JS Migrations
All schema changes go in `pocketbase/pb_migrations/` as JS migration files. PocketBase applies unapplied migrations automatically on startup. Applied migrations are tracked in `_migrations` in the DB — never re-run.

**To add/change schema:**
1. Write a new migration file — use the current Unix timestamp as the filename prefix:
   ```bash
   date +%s  # get timestamp
   ```
   File: `pocketbase/pb_migrations/[timestamp]_description.js`
   ```js
   /// <reference path="../pb_data/types.d.ts" />
   migrate((db) => {
     const dao = new Dao(db)
     const collection = dao.findCollectionByNameOrId("collection_name")
     collection.schema.addField(new SchemaField({
       "name": "field_name", "type": "text", "required": false, "options": {}
     }))
     return dao.saveCollection(collection)
   }, (db) => {
     // down: reverse the change
     const dao = new Dao(db)
     const collection = dao.findCollectionByNameOrId("collection_name")
     collection.schema.removeField(collection.schema.getFieldByName("field_name").id)
     return dao.saveCollection(collection)
   })
   ```
2. Rebuild: `docker compose up -d --build price-track`

No backup needed before schema changes — migrations are transactional and non-destructive. The existing data in the volume is untouched; only the collection definition changes.

## Get an Admin Token (inside container)
```bash
docker exec price-track sh -c 'curl -s -X POST http://localhost:8090/api/admins/auth-with-password \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$PB_ADMIN_EMAIL\",\"password\":\"$PB_ADMIN_PASSWORD\"}" \
  | sed "s/.*\"token\":\"\([^\"]*\)\".*/\1/"'
```

## Environment
- `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` — PocketBase admin credentials
- `POCKETBASE_ADMIN_EMAIL` / `POCKETBASE_ADMIN_PASSWORD` — same values, used by worker
- `CLAUDE_BIN` — path to claude CLI binary (default: `/usr/local/bin/claude`)
- `CLAUDE_HOME` — home dir for claude CLI (default: `/root`)
- `CHECK_INTERVAL_MINUTES` — scheduler interval (default: 60)

## `claude` CLI spawns run as host uid 1000, not root (2026-07-05)
`docker-compose.yml` bind-mounts the host's live `~/.claude` read-write into this container so the
worker's `claude` calls (`scraper.js`: `callClaude`, `findAustralianRetailersStream`) use the same
authenticated account as the host's interactive `claude` session — no separate login. The container
itself still runs as root (PocketBase/Xvfb/Playwright need it), but both `spawn(CLAUDE_BIN, ...)`
calls pass `uid: 1000, gid: 1000` so the `claude` child process writes `~/.claude` files as `sean`.
Without this, every scrape's `claude` invocation (this scheduler runs several concurrently via
`Promise.all` every `CHECK_INTERVAL_MINUTES`) left root-owned files in the shared `~/.claude`
(config, credentials, plugin state) that the host's own `sean`-uid session couldn't overwrite —
2031+ root-owned files had piled up, and this was a likely contributor to Sean's host `claude`
session needing frequent re-logins. `Dockerfile` also does `RUN chmod 755 /root` so uid 1000 can
traverse into the bind-mounted `.claude` dir (`/root` defaults to `700 root:root`). Full writeup in
`claude-usage-widget`'s worklog (`2026-07-05-shared-credentials-uid-fix.md`), which hit the same bug.
