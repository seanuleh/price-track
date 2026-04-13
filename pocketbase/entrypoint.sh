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
