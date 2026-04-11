# price-track

A self-hosted price tracking app. Track products across multiple Australian retailers, get notified when prices drop, and visualise price history over time.

![Price history chart with multiple retailers](https://placeholder)

## Features

- Track products across multiple retailers simultaneously
- Automatic price checks on a configurable schedule
- Price history chart with time-window filtering (1D / 1W / 1M / 6M / 1Y / All)
- AI-powered retailer discovery — find Australian stores selling a product automatically
- AI-powered price detection — no manual CSS selectors needed for most sites
- Alerts: notify when price drops below a target, rises above, drops at all, or any change
- Notifications via Pushbullet, webhook, or email
- Multi-user support via PocketBase auth

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Recharts |
| Backend | PocketBase 0.22.22 (SQLite) |
| Scraper | Playwright (Chromium) |
| AI | Claude CLI (price detection, retailer discovery) |
| Container | Single Docker image (Playwright Jammy base) |

## Quick Start

### 1. Prerequisites

- Docker + Docker Compose
- [Claude CLI](https://claude.ai/download) installed on the host (for AI features)
  - Log in with `claude` on the host before deploying
  - AI features are optional — scraping works without Claude for most sites

### 2. docker-compose.yml

```yaml
services:
  price-track:
    image: ghcr.io/your-user/price-track:latest
    # or build from source:
    # build: .
    container_name: price-track
    restart: unless-stopped
    environment:
      - PB_ADMIN_EMAIL=admin@example.com
      - PB_ADMIN_PASSWORD=changeme
      - POCKETBASE_URL=http://localhost:8090
      - POCKETBASE_ADMIN_EMAIL=admin@example.com
      - POCKETBASE_ADMIN_PASSWORD=changeme
      - CHECK_INTERVAL_MINUTES=60
      # Claude CLI — remove these if not using AI features
      - CLAUDE_BIN=/usr/local/bin/claude
      - CLAUDE_HOME=/root
    volumes:
      - ./data:/pb/pb_data
      # Claude CLI — mount your host claude binary and config (read-only)
      # Remove these volumes if not using AI features
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

### 3. Run

```bash
docker compose up -d
```

Open `http://localhost:8090` in your browser.

> **Note on auth:** See the [Authentication](#authentication) section below before exposing this to the internet.

---

## Authentication

### Current limitation

The frontend currently has **no built-in login form**. It checks `localStorage` for a valid PocketBase auth token and assumes one is present. This means out of the box, you need one of the following:

**Option A — Direct PocketBase auth (requires small code change)**
Add a login form to the frontend that calls `/api/users/auth-with-password`. This is straightforward — PocketBase has a well-documented JS SDK for this. The data model already supports multi-user (every record has a `user` relation field).

**Option B — Reverse proxy SSO (what this repo uses in production)**
Inject a PocketBase token into `localStorage` via a sidecar auth service + nginx `sub_filter`. The production deployment uses [cf-auth](https://github.com/your-user/cf-auth) with Cloudflare Zero Trust for this. This is entirely optional and not required to run the app — it's an nginx-layer convenience.

**Option C — Local / trusted network only**
If running on a local network you fully trust, you can manually create a user in the PocketBase admin UI (`http://localhost:8090/_/`) and use the PocketBase SDK's `authWithPassword` in the browser console to set the token once.

### PocketBase admin UI

Always available at `http://<host>:8090/_/`. First boot will prompt you to create an admin account (or use `PB_ADMIN_EMAIL` / `PB_ADMIN_PASSWORD` env vars which are set automatically on startup).

---

## Configuration

All configuration is via environment variables. Copy `.env.example` to get started:

```bash
cp .env.example .env
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PB_ADMIN_EMAIL` | — | PocketBase admin email (required) |
| `PB_ADMIN_PASSWORD` | — | PocketBase admin password (required) |
| `POCKETBASE_URL` | `http://localhost:8090` | PocketBase URL as seen by the worker |
| `POCKETBASE_ADMIN_EMAIL` | — | Same as `PB_ADMIN_EMAIL` |
| `POCKETBASE_ADMIN_PASSWORD` | — | Same as `PB_ADMIN_PASSWORD` |
| `CHECK_INTERVAL_MINUTES` | `60` | How often the scheduler runs price checks |
| `CLAUDE_BIN` | `/usr/local/bin/claude` | Path to Claude CLI binary |
| `CLAUDE_HOME` | `/root` | Home directory for Claude CLI subprocess |

---

## AI Features (Claude CLI)

Price Track uses the [Claude CLI](https://claude.ai/download) for:

1. **Price detection fallback** — When CSS heuristics can't find the price, Claude analyses the page HTML
2. **Retailer discovery** — "Find AU Retailers" button uses Claude with web search to find Australian stores
3. **Product metadata** — Auto-fills name, brand, description, image when adding a product by URL

These features are **optional**. The app works without Claude — most major retail sites are detected via CSS heuristics (Shopify, WooCommerce, Magento, Amazon). Claude is only called as a fallback.

### Setup

1. Install Claude CLI on your host: `npm install -g @anthropic-ai/claude-cli` or download from claude.ai
2. Log in: `claude` (follow prompts)
3. Mount into the container (see docker-compose example above)

---

## Data Model

| Collection | Purpose |
|-----------|---------|
| `products` | Products being tracked (name, url, image, brand, model, description, category) |
| `retailers` | Retailer per product (name, url, CSS selector, last_price, last_checked, enabled) |
| `price_history` | Price snapshots over time (retailer, product, price, currency, in_stock) |
| `alerts` | Alert rules (condition: `below` / `above` / `any_change` / `any_drop`, target_price) |
| `notification_channels` | Notification config (type: `pushbullet` / `webhook` / `email`, config JSON) |
| `users` | PocketBase auth users |

Data is stored in SQLite via PocketBase, persisted to the `./data` volume mount.

---

## Notifications

Configure notification channels in the Settings page.

| Type | Config fields |
|------|--------------|
| Pushbullet | `api_key` |
| Webhook | `url`, optional `secret` (HMAC-SHA256 signature) |
| Email | `to`, `from`, `api_key` (Resend) — requires code completion, see `worker/src/notifiers/email.js` |

### Adding a new notifier

1. Create `worker/src/notifiers/<type>.js` — export `async function send(config, notification)`
2. Register in `worker/src/notifiers/index.js`
3. Add `<type>` to the `notification_channels` collection's `type` select options
4. Add UI config fields in `frontend/src/pages/Settings.jsx` → `CHANNEL_TYPES`

---

## Worker API

The Node.js worker exposes an internal API at `:3500` (proxied via nginx or accessed directly):

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/price-track/scrape` | POST | Manually scrape a retailer (`{ retailer_id }`) |
| `/api/price-track/detect-selector` | POST | AI-detect price CSS selector (`{ url }`) |
| `/api/price-track/fetch-meta` | POST | AI-fetch product metadata (`{ url?, query? }`) |
| `/api/price-track/find-retailers` | POST | AI-find AU retailers (`{ product_name, brand?, model?, url? }`) |
| `/api/price-track/test-notification` | POST | Test a notification channel (`{ channel_id }`) |
| `/api/price-track/check-all` | POST | Trigger full scheduled check run |
| `/api/price-track/health` | GET | Health check |

All endpoints except `/health` require an `Authorization` header with a valid PocketBase user token.

---

## Nginx Reverse Proxy

If running behind nginx, proxy both PocketBase and the worker API:

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

    # Everything else (PocketBase API + frontend)
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

# PocketBase (download binary from https://pocketbase.io)
./pocketbase serve --dir=./pb_data --publicDir=./frontend/dist
```

---

## Building

```bash
docker build -t price-track .
```

The Dockerfile is a two-stage build:
1. `node:20-alpine` — builds the React frontend
2. `mcr.microsoft.com/playwright:v1.58.2-jammy` — runtime with PocketBase + Node worker + Chromium
