#!/bin/sh
set -e

echo "[arkon] Running database migrations..."
npx tsx scripts/migrate.ts

echo "[arkon] Migrations complete. Starting Arkon..."
exec node server.js
