# price-track

A self-hosted price tracking app. Track products across multiple Australian retailers, get notified when prices drop, and visualise price history over time.

## Features

- Track products across multiple retailers simultaneously
- Automatic price checks on a configurable schedule
- Price history chart with time-window filtering (1D / 1W / 1M / 6M / 1Y / All)
- AI-powered retailer discovery — find Australian stores selling a product automatically
- AI-powered price detection — no manual CSS selectors required for most sites
- Bot protection detection — retailers that block scraping are automatically disabled
- Alerts: notify when price drops below a target, rises above, drops at all, or any change
- Notifications via Pushbullet, webhook, or email
- Mobile-optimised UI

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Recharts |
| Backend | PocketBase 0.23 (SQLite) |
| Scraper | Playwright (Chromium → Firefox → WebKit fallback chain) |
| AI (vision) | Ollama + qwen2.5vl (price detection from screenshots) |
| AI (text) | Claude CLI — Haiku (retailer discovery, product metadata) |
| Container | Single Docker image |

## Quick Start

### Prerequisites

- Docker + Docker Compose
- [Claude CLI](https://claude.ai/download) installed and authenticated on the host (for AI features — optional but recommended)

### 1. Create a docker-compose.yml

```yaml
services:
  price-track:
    build: .
    container_name: price-track
    restart: unless-stopped
    environment:
      - PB_ADMIN_EMAIL=admin@example.com
      - PB_ADMIN_PASSWORD=changeme
      - POCKETBASE_ADMIN_EMAIL=admin@example.com
      - POCKETBASE_ADMIN_PASSWORD=changeme
      - CHECK_INTERVAL_MINUTES=60
      # Claude CLI — remove if not using AI features
      - CLAUDE_BIN=/usr/local/bin/claude
      - CLAUDE_HOME=/root
    volumes:
      - ./data:/pb/pb_data
      # Claude CLI — mount from host (remove if not using AI features)
      - ~/.local/bin/claude:/usr/local/bin/claude:ro
      - ~/.claude:/root/.claude:ro
      - ~/.claude.json:/root/.claude.json:ro
    ports:
      - "8090:8090"
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:8090/api/health"]
      interval: 10s
      timeout: 5s
      retries: 10
```

### 2. Run

```bash
docker compose up -d
```

Open `http://localhost:8090` in your browser.

### 3. Log in

The app uses PocketBase's native auth. There is no login screen in the frontend — authentication is handled by setting a valid `pocketbase_auth` token in `localStorage`.

**Easiest approach:** log in via the PocketBase admin UI at `http://localhost:8090/_/`, then copy the token from the network tab into `localStorage.pocketbase_auth` in your browser console. Alternatively, use the PocketBase JS SDK to authenticate and the token is stored automatically.

---

## Configuration

Copy `.env.example` to get started:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PB_ADMIN_EMAIL` | — | PocketBase admin email (required) |
| `PB_ADMIN_PASSWORD` | — | PocketBase admin password (required) |
| `POCKETBASE_ADMIN_EMAIL` | — | Same value — used by the worker process |
| `POCKETBASE_ADMIN_PASSWORD` | — | Same value — used by the worker process |
| `POCKETBASE_URL` | `http://localhost:8090` | PocketBase URL as seen by the worker (change if running separately) |
| `CHECK_INTERVAL_MINUTES` | `60` | How often the scheduler runs price checks |
| `CLAUDE_BIN` | `/usr/local/bin/claude` | Path to Claude CLI binary inside container |
| `CLAUDE_HOME` | `/root` | Home directory for Claude CLI subprocess |
| `OLLAMA_URL` | `http://ollama:11434` | Ollama API URL for vision-based price detection |
| `VISION_MODEL` | `qwen2.5vl:7b` | Ollama model to use for screenshot price extraction |

---

## AI Features

Price Track uses two AI backends:

### Vision — Ollama (qwen2.5vl)
When CSS heuristics fail to extract a price, the scraper takes a screenshot of the product page and sends it to a local Ollama instance running `qwen2.5vl:7b` (configurable via `VISION_MODEL` and `OLLAMA_URL`). Requires Ollama running with a vision-capable model loaded.

### Text — Claude CLI
1. **Retailer discovery** — "Find AU Retailers" uses Claude with web search to find Australian stores selling a product
2. **Product metadata** — Auto-fills name, brand, description, and image when adding a product by URL

Claude features are **optional**. Most major retail sites work without Claude via built-in CSS heuristics (Shopify, WooCommerce, Magento, Amazon).

### Setup

1. Install Claude CLI: download from [claude.ai/download](https://claude.ai/download) or `npm install -g @anthropic-ai/claude-code`
2. Authenticate: run `claude` and follow the prompts
3. Mount into the container via the volumes in the docker-compose example above

---

## Scraping

The scraper tries three browser engines in order before giving up:

1. **Chromium** (with stealth plugin)
2. **Firefox**
3. **WebKit**

If a retailer's site blocks all three with bot protection (Cloudflare, Imperva, CAPTCHA, HTTP 403/429), the retailer is automatically disabled so it stops wasting check cycles. You can re-enable it manually from the UI.

---

## Notifications

Configure notification channels in the **Settings** page.

| Type | Config fields |
|------|--------------|
| Pushbullet | `api_key` |
| Webhook | `url`, optional `secret` (sent as `X-Signature` HMAC-SHA256) |
| Email | `address` (stub — requires completing `worker/src/notifiers/email.js`) |

### Adding a custom notifier

1. Create `worker/src/notifiers/<type>.js` — export `async function send(config, notification)`
2. Register it in `worker/src/notifiers/index.js`
3. Add the type to the `notification_channels` collection's `type` select field (via PocketBase admin or schema wipe/restore)
4. Add UI config fields in `frontend/src/pages/Settings.jsx` → `CHANNEL_TYPES`

---

## Data Model

| Collection | Purpose |
|-----------|---------|
| `products` | Tracked products (name, url, image, brand, model, description, category) |
| `retailers` | Retailer per product (name, url, last_price, last_checked, enabled) |
| `price_history` | Price snapshots (retailer, product, price, currency, in_stock) |
| `alerts` | Alert rules (condition: `below` / `above` / `any_change` / `any_drop`, target_price) |
| `notification_channels` | Notification config (type, config JSON, enabled) |
| `users` | PocketBase auth users |

All data is stored in SQLite via PocketBase, persisted to the `./data` volume.

---

## Worker API

The worker exposes an internal HTTP API at port `3500`, proxied at `/api/price-track/`:

| Endpoint | Method | Body | Purpose |
|----------|--------|------|---------|
| `/api/price-track/scrape` | POST | `{ retailer_id }` | Manually trigger a price check |
| `/api/price-track/check-all` | POST | `{ product_id? }` | Trigger a full run, or a single-product check if `product_id` is provided |
| `/api/price-track/detect-selector` | POST | `{ url }` | AI-detect price CSS selector |
| `/api/price-track/fetch-meta` | POST | `{ url?, query? }` | AI-fetch product metadata |
| `/api/price-track/find-retailers` | POST | `{ product_name, brand?, model?, url? }` | AI-find AU retailers |
| `/api/price-track/test-notification` | POST | `{ channel_id }` | Send a test notification |
| `/api/price-track/health` | GET | — | Health check |

All endpoints except `/health` require an `Authorization` header with a valid PocketBase user token.

---

## Reverse Proxy (nginx)

```nginx
server {
    listen 443 ssl;
    server_name price-track.example.com;

    # Worker API
    location ^~ /api/price-track/ {
        proxy_pass http://price-track:3500;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 120s;
    }

    # Hashed assets — cache forever
    location ~* ^/assets/ {
        proxy_pass http://price-track:8090;
        proxy_set_header Host $host;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    # PocketBase + frontend
    location / {
        proxy_pass http://price-track:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_read_timeout 86400s;
        add_header Cache-Control "no-cache" always;
    }
}
```

---

## Development

```bash
# Frontend dev server (hot reload)
cd frontend && npm install && npm run dev

# Worker (requires PocketBase running separately)
cd worker && npm install && node src/index.js

# PocketBase standalone
./pocketbase serve --dir=./pb_data --publicDir=./frontend/dist
```

## Building

```bash
docker build -t price-track .
```

Two-stage build: `node:20-alpine` builds the React frontend, then the Playwright Jammy base image runs PocketBase + the Node worker with Chromium/Firefox/WebKit available.
