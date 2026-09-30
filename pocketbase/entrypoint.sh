#!/bin/sh
# price-track — PocketBase init (0.23+). Schema + settings live in pb_migrations/
# (applied on serve). This only ensures the superuser exists (idempotent).
# Called by the top-level entrypoint.sh with --init-only, then PB is started there.
set -e

PB="/pb/pocketbase"

$PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD" --dir=/pb/pb_data

if [ "$1" = "--init-only" ]; then exit 0; fi

exec $PB serve --http=0.0.0.0:8090 --dir=/pb/pb_data --publicDir=/pb/pb_public \
  --migrationsDir=/pb/pb_migrations
