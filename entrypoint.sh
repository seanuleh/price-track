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

# Start Node worker in background
echo "[entrypoint] Starting worker..."
cd /worker && node src/index.js &
WORKER_PID=$!

# If either process dies, kill the other and exit
wait -n $PB_PID $WORKER_PID
echo "[entrypoint] A process exited. Shutting down..."
kill $PB_PID $WORKER_PID 2>/dev/null || true
wait
