# price-track — Agent Reference

## Stack
- React + Vite frontend, PocketBase 0.22.22 backend, single Docker container
- Node.js worker (runs inside same container) — Playwright scraping + Claude CLI AI + scheduled checks
- Auth: Cloudflare Access → cfAuth sidecar auto-creates PB users and injects token into localStorage. No login form needed.

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
