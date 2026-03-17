#!/bin/sh
set -e

# Validate required env vars
if [ -z "$DATABASE_URL" ]; then
  echo "[arkon] ERROR: DATABASE_URL is not set. Exiting."
  exit 1
fi

# Wait for database to accept connections (up to 30s)
echo "[arkon] Waiting for database..."
RETRIES=15
until node -e "const{Pool}=require('pg');const p=new Pool({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:2000});p.query('SELECT 1').then(()=>{p.end();process.exit(0)}).catch(()=>{p.end();process.exit(1)})" 2>/dev/null; do
  RETRIES=$((RETRIES - 1))
  if [ "$RETRIES" -le 0 ]; then
    echo "[arkon] ERROR: Could not connect to database after 30s. Exiting."
    exit 1
  fi
  sleep 2
done
echo "[arkon] Database is ready."

echo "[arkon] Running database migrations..."
npx tsx scripts/migrate.ts

echo "[arkon] Migrations complete. Starting Arkon..."
exec node server.js
