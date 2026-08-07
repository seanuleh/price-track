#!/bin/bash
set -e

PB_BIN="/pb/pocketbase"
DATA_DIR="/pb/pb_data"

# Run schema init (starts PB temporarily, creates collections, stops PB)
/pb/entrypoint.sh --init-only

# Start PocketBase in background
echo "[entrypoint] Starting PocketBase..."
$PB_BIN serve --http=0.0.0.0:8090 --dir="$DATA_DIR" --publicDir="/pb/pb_public" &
PB_PID=$!

# Start virtual display for headed Chrome (bypasses bot detection).
# Supervised: Xvfb has died mid-life before, and every headed-browser code path
# (fetchProductMeta, detect-selector, vision scrape) then fails silently with
# "launched a headed browser without having a XServer running" — so respawn it.
echo "[entrypoint] Starting Xvfb..."
xvfb_supervise() {
  while true; do
    rm -f /tmp/.X99-lock
    Xvfb :99 -screen 0 1920x1080x24 -ac +extension GLX +render -noreset
    echo "[entrypoint] Xvfb exited ($?) — restarting in 2s"
    sleep 2
  done
}
xvfb_supervise &
XVFB_PID=$!
export DISPLAY=:99

# Start Node worker in background
echo "[entrypoint] Starting worker..."
cd /worker && DISPLAY=:99 node src/index.js &
WORKER_PID=$!

# If either process dies, kill the other and exit
wait -n $PB_PID $WORKER_PID
echo "[entrypoint] A process exited. Shutting down..."
kill $PB_PID $WORKER_PID $XVFB_PID 2>/dev/null || true
pkill -f 'Xvfb :99' 2>/dev/null || true
wait
