# price-track — Agent Reference

## Stack
- React + Vite frontend, PocketBase 0.22.22 backend, single Docker container
- Node.js worker (runs inside same container) — Playwright scraping + Claude CLI AI + scheduled checks
- Auth: PocketBase native auth. Frontend currently has no login form — it expects a valid `pocketbase_auth` token in localStorage. See README for auth options.

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
3. Add the type to `notification_channels` collection's `type` select field options (admin API or wipe+restore)
4. Add UI fields in `frontend/src/pages/Settings.jsx` → `CHANNEL_TYPES`

## ⚠️ ALWAYS Back Up Before Schema Changes
```bash
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
tar -czf /data/price-track/backups/${TIMESTAMP}.tar.gz -C /data/price-track --exclude=backups --exclude=storage --exclude=venv .
```

## Schema Changes — Preferred Method: Wipe + Restore
**Never PATCH `/api/collections` from entrypoint.sh** — it runs on every restart.

**Safe procedure:**
1. Add new field to `pocketbase/entrypoint.sh`
2. Back up and checkpoint WAL:
   ```bash
   TIMESTAMP=$(date +%Y%m%d_%H%M%S)
   tar -czf /data/price-track/backups/${TIMESTAMP}.tar.gz -C /data/price-track --exclude=backups --exclude=storage --exclude=venv .
   docker run --rm -v /data/price-track:/data alpine sh -c \
     'apk add -q sqlite && sqlite3 /data/data.db "PRAGMA wal_checkpoint(TRUNCATE);"'
   ```
3. Read existing data from backup:
   ```bash
   tar -tzf /data/price-track/backups/${TIMESTAMP}.tar.gz  # list contents
   tar -xzf /data/price-track/backups/${TIMESTAMP}.tar.gz -C /tmp/pb-restore
   docker run --rm -v /tmp/pb-restore:/data alpine sh -c \
     'apk add -q sqlite && sqlite3 /data/data.db "SELECT * FROM <table>;"'
   ```
4. Wipe and reinitialise:
   ```bash
   docker run --rm -v /data/price-track:/data alpine sh -c \
     "rm -f /data/data.db /data/data.db-shm /data/data.db-wal /data/logs.db /data/logs.db-shm /data/logs.db-wal /data/types.d.ts"
   docker compose up -d --force-recreate price-track
   ```
5. Re-insert data via SQL file

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
