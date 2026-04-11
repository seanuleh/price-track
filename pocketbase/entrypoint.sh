#!/bin/bash
set -e

PB_BIN="/pb/pocketbase"
DATA_DIR="/pb/pb_data"

echo "Starting PocketBase init..."

$PB_BIN serve --http=0.0.0.0:8090 --dir="$DATA_DIR" --publicDir="/pb/pb_public" &
PB_PID=$!

echo "Waiting for PocketBase to be ready..."
for i in $(seq 1 30); do
  if wget -q --spider http://localhost:8090/api/health 2>/dev/null; then
    echo "PocketBase is ready."
    break
  fi
  sleep 1
done

# Create admin account (no-op if already exists)
echo "Creating admin account..."
wget -q -O - --post-data="{\"email\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\",\"passwordConfirm\":\"${PB_ADMIN_PASSWORD}\"}" \
  --header="Content-Type: application/json" \
  http://localhost:8090/api/admins 2>&1 || true

# Authenticate to get token
echo "Authenticating..."
AUTH_RESP=$(wget -q -O - --post-data="{\"identity\":\"${PB_ADMIN_EMAIL}\",\"password\":\"${PB_ADMIN_PASSWORD}\"}" \
  --header="Content-Type: application/json" \
  http://localhost:8090/api/admins/auth-with-password)

TOKEN=$(echo "$AUTH_RESP" | sed 's/.*"token":"\([^"]*\)".*/\1/')
echo "Got token: ${TOKEN:0:20}..."

# Configure trusted proxy headers
wget -q -O - \
  --method=PATCH \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  --body-data='{"trustedProxy":{"headers":["X-Forwarded-For"]}}' \
  http://localhost:8090/api/settings 2>&1 | head -c 120 || true

# Helper: get collection ID by name
get_collection_id() {
  wget -q -O - \
    --header="Authorization: ${TOKEN}" \
    "http://localhost:8090/api/collections?filter=name%3D%22$1%22" \
  | sed 's/.*"items":\[{"id":"\([^"]*\)".*/\1/'
}

# Helper: check if collection exists
collection_exists() {
  ID=$(get_collection_id "$1")
  [ -n "$ID" ] && [ "$ID" != '{"code"' ]
}

# ── users auth collection ──────────────────────────────────────────────────────
echo "Creating users collection..."
wget -q -O /dev/null --post-data='{
  "name": "users",
  "type": "auth",
  "schema": [],
  "listRule": "@request.auth.id != \"\"",
  "viewRule": "@request.auth.id != \"\"",
  "createRule": null,
  "updateRule": "@request.auth.id = id",
  "deleteRule": null
}' \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  http://localhost:8090/api/collections 2>&1 || true

# ── products collection ────────────────────────────────────────────────────────
echo "Creating products collection..."
wget -q -O /dev/null --post-data='{
  "name": "products",
  "type": "base",
  "schema": [
    { "name": "name",        "type": "text",   "required": true,  "options": {} },
    { "name": "url",         "type": "url",    "required": false, "options": {} },
    { "name": "image_url",   "type": "url",    "required": false, "options": {} },
    { "name": "description", "type": "text",   "required": false, "options": {} },
    { "name": "brand",       "type": "text",   "required": false, "options": {} },
    { "name": "model",       "type": "text",   "required": false, "options": {} },
    { "name": "category",    "type": "text",   "required": false, "options": {} },
    { "name": "user",        "type": "relation","required": false,
      "options": {"collectionId": "_pb_users_auth_", "cascadeDelete": true, "maxSelect": 1} }
  ],
  "listRule": "",
  "viewRule": "",
  "createRule": "",
  "updateRule": "",
  "deleteRule": ""
}' \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  http://localhost:8090/api/collections 2>&1 || true

# Fetch the actual IDs now that collections exist
PRODUCTS_ID=$(get_collection_id "products")
echo "Products collection ID: $PRODUCTS_ID"

# ── retailers collection ───────────────────────────────────────────────────────
echo "Creating retailers collection..."
wget -q -O /dev/null --post-data="{
  \"name\": \"retailers\",
  \"type\": \"base\",
  \"schema\": [
    { \"name\": \"product\",     \"type\": \"relation\", \"required\": true,
      \"options\": {\"collectionId\": \"${PRODUCTS_ID}\", \"cascadeDelete\": true, \"maxSelect\": 1} },
    { \"name\": \"name\",        \"type\": \"text\",  \"required\": true,  \"options\": {} },
    { \"name\": \"url\",         \"type\": \"url\",   \"required\": true,  \"options\": {} },
    { \"name\": \"selector\",    \"type\": \"text\",  \"required\": false, \"options\": {} },
    { \"name\": \"enabled\",     \"type\": \"bool\",  \"required\": false, \"options\": {} },
    { \"name\": \"last_price\",   \"type\": \"number\",\"required\": false, \"options\": {\"min\": 0} },
    { \"name\": \"last_checked\", \"type\": \"date\",  \"required\": false, \"options\": {} },
    { \"name\": \"is_scraping\",  \"type\": \"bool\",  \"required\": false, \"options\": {} },
    { \"name\": \"user\",        \"type\": \"relation\",\"required\": false,
      \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1} }
  ],
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"\",
  \"updateRule\": \"\",
  \"deleteRule\": \"\"
}" \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  http://localhost:8090/api/collections 2>&1 || true

RETAILERS_ID=$(get_collection_id "retailers")
echo "Retailers collection ID: $RETAILERS_ID"

# ── price_history collection ───────────────────────────────────────────────────
echo "Creating price_history collection..."
wget -q -O /dev/null --post-data="{
  \"name\": \"price_history\",
  \"type\": \"base\",
  \"schema\": [
    { \"name\": \"retailer\", \"type\": \"relation\", \"required\": true,
      \"options\": {\"collectionId\": \"${RETAILERS_ID}\", \"cascadeDelete\": true, \"maxSelect\": 1} },
    { \"name\": \"product\",  \"type\": \"relation\", \"required\": true,
      \"options\": {\"collectionId\": \"${PRODUCTS_ID}\", \"cascadeDelete\": true, \"maxSelect\": 1} },
    { \"name\": \"price\",    \"type\": \"number\", \"required\": true, \"options\": {\"min\": 0} },
    { \"name\": \"currency\", \"type\": \"text\",   \"required\": false, \"options\": {} },
    { \"name\": \"in_stock\", \"type\": \"bool\",   \"required\": false, \"options\": {} },
    { \"name\": \"user\",     \"type\": \"relation\",\"required\": false,
      \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1} }
  ],
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"\",
  \"updateRule\": \"\",
  \"deleteRule\": \"\"
}" \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  http://localhost:8090/api/collections 2>&1 || true

# ── alerts collection ──────────────────────────────────────────────────────────
echo "Creating alerts collection..."
wget -q -O /dev/null --post-data="{
  \"name\": \"alerts\",
  \"type\": \"base\",
  \"schema\": [
    { \"name\": \"product\",      \"type\": \"relation\", \"required\": true,
      \"options\": {\"collectionId\": \"${PRODUCTS_ID}\", \"cascadeDelete\": true, \"maxSelect\": 1} },
    { \"name\": \"target_price\", \"type\": \"number\", \"required\": false, \"options\": {\"min\": 0} },
    { \"name\": \"condition\",    \"type\": \"select\", \"required\": true,
      \"options\": {\"values\": [\"below\", \"above\", \"any_change\", \"any_drop\"], \"maxSelect\": 1} },
    { \"name\": \"enabled\",      \"type\": \"bool\",   \"required\": false, \"options\": {} },
    { \"name\": \"triggered_at\", \"type\": \"date\",   \"required\": false, \"options\": {} },
    { \"name\": \"user\",         \"type\": \"relation\",\"required\": false,
      \"options\": {\"collectionId\": \"_pb_users_auth_\", \"cascadeDelete\": true, \"maxSelect\": 1} }
  ],
  \"listRule\": \"\",
  \"viewRule\": \"\",
  \"createRule\": \"\",
  \"updateRule\": \"\",
  \"deleteRule\": \"\"
}" \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  http://localhost:8090/api/collections 2>&1 || true

# ── notification_channels collection ──────────────────────────────────────────
echo "Creating notification_channels collection..."
wget -q -O /dev/null --post-data='{
  "name": "notification_channels",
  "type": "base",
  "schema": [
    { "name": "type",    "type": "select", "required": true,
      "options": {"values": ["pushbullet", "webhook", "email"], "maxSelect": 1} },
    { "name": "name",    "type": "text",   "required": true,  "options": {} },
    { "name": "config",  "type": "json",   "required": false, "options": {"maxSize": 2000000} },
    { "name": "enabled", "type": "bool",   "required": false, "options": {} },
    { "name": "user",    "type": "relation","required": false,
      "options": {"collectionId": "_pb_users_auth_", "maxSelect": 1} }
  ],
  "listRule": "",
  "viewRule": "",
  "createRule": "",
  "updateRule": "",
  "deleteRule": ""
}' \
  --header="Content-Type: application/json" \
  --header="Authorization: ${TOKEN}" \
  http://localhost:8090/api/collections 2>&1 || true

echo "Collections created. Verifying..."
wget -q -O - \
  --header="Authorization: ${TOKEN}" \
  "http://localhost:8090/api/collections?perPage=20" \
| grep -o '"name":"[^"]*"' | grep -v '"name":"[a-z]*"$' || true

echo "Stopping background PocketBase..."
kill $PB_PID
wait $PB_PID 2>/dev/null || true

echo "Init complete."

# If called with --init-only, exit here (used by merged entrypoint)
if [ "$1" = "--init-only" ]; then
  exit 0
fi

echo "Starting PocketBase in foreground..."
exec $PB_BIN serve --http=0.0.0.0:8090 --dir="$DATA_DIR" --publicDir="/pb/pb_public"
