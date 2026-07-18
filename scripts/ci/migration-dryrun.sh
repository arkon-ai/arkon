#!/usr/bin/env bash
# scripts/ci/migration-dryrun.sh — apply pending migrations against the checked-in
# prod-schema snapshot (transformate WI-2075, under WI-1847).
#
# Why this exists: on 2026-07-18 migration 024 was CI-green (CI builds its DB from
# 000_base_schema.sql, which had drifted from prod) and fatal on prod — it sat
# merged-but-undeployable in front of the queue, blocking 025-028 (see arkon #90/#91
# for the reactive fix). This job is the permanent prevention: it restores a
# schema-only snapshot of the REAL prod schema (db/prod-snapshot/) and runs the real
# migrator against it, so a migration that would abort on prod fails the PR instead.
#
# Modes:
#   real      — run scripts/migrate.ts over the actual pending set. Must exit 0.
#   selftest  — seed db/ci/selftest_024_shape.sql (nonexistent column + FK to a
#               missing row, the 024 shape) as a pending migration and require the
#               migrator to ABORT on it. Proves the job catches the incident class.
#
# Snapshot freshness: warn-not-fail when the snapshot is older than 14 days
# (refresh procedure: db/prod-snapshot/README.md). CI cannot reach the tailnet, so
# the snapshot is refreshed fleet-side and committed.
set -euo pipefail

MODE="${1:?usage: migration-dryrun.sh real|selftest}"
case "$MODE" in
  real|selftest) ;;
  *) echo "usage: migration-dryrun.sh real|selftest (got '$MODE')" >&2; exit 2 ;;
esac
ROOT="$(git rev-parse --show-toplevel)"
SNAP_DIR="$ROOT/db/prod-snapshot"
PG_BASE_URL="${PG_BASE_URL:-postgresql://arkon:arkon@localhost:5432}"
DB_NAME="dryrun_${MODE}"
ADMIN_URL="${PG_BASE_URL}/postgres"
DB_URL="${PG_BASE_URL}/${DB_NAME}"

[ -f "$SNAP_DIR/schema.sql.gz" ] && [ -f "$SNAP_DIR/seed.sql" ] && [ -f "$SNAP_DIR/META.txt" ] || {
  echo "::error::prod snapshot incomplete under db/prod-snapshot/ (need schema.sql.gz, seed.sql, META.txt) — see db/prod-snapshot/README.md" >&2
  exit 1
}

# ── Staleness guard: warn (never fail) past 14 days ──
captured_at="$(grep -m1 '^captured_at=' "$SNAP_DIR/META.txt" | cut -d= -f2- || true)"
if [ -n "$captured_at" ] && captured_epoch="$(date -u -d "$captured_at" +%s 2>/dev/null)"; then
  age_days=$(( ( $(date -u +%s) - captured_epoch ) / 86400 ))
  echo "prod snapshot captured_at=${captured_at} (${age_days}d old)"
  if [ "$age_days" -gt 14 ]; then
    echo "::warning title=Prod schema snapshot is stale::db/prod-snapshot captured ${captured_at} (${age_days}d > 14d). The dry-run may not reflect current prod — refresh per db/prod-snapshot/README.md (runbook step: refresh on each deploy)."
  fi
else
  echo "::warning title=Snapshot capture date unreadable::META.txt has no parseable captured_at= line — staleness guard skipped."
fi

# ── Fresh DB + restore ──
psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS ${DB_NAME};" -c "CREATE DATABASE ${DB_NAME};"
# Idempotent extension creation: the CI image may pre-create timescaledb in new DBs.
gunzip -c "$SNAP_DIR/schema.sql.gz" \
  | sed -E 's/^CREATE EXTENSION (IF NOT EXISTS )?/CREATE EXTENSION IF NOT EXISTS /' \
  | psql "$DB_URL" -v ON_ERROR_STOP=1 -q
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -f "$SNAP_DIR/seed.sql"
# seed.sql carries explicit _migrations.id values; realign the serial so the
# migrator's INSERT (name only) doesn't collide on the primary key.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c \
  "SELECT setval(pg_get_serial_sequence('_migrations','id'), COALESCE((SELECT MAX(id) FROM _migrations), 1));"
applied="$(psql "$DB_URL" -tAc 'SELECT COUNT(*) FROM _migrations;')"
tenants="$(psql "$DB_URL" -tAc 'SELECT COUNT(*) FROM tenants;')"
echo "restored prod snapshot into ${DB_NAME}: ${applied} applied migrations recorded, ${tenants} tenants seeded"

if [ "$MODE" = "selftest" ]; then
  # Work dir INSIDE the workspace so npx resolves the repo's own tsx install
  # (an out-of-tree cwd would fall back to a registry fetch — false gate).
  WORK="$ROOT/.ci-selftest"
  rm -rf "$WORK"; mkdir -p "$WORK"
  cp -r "$ROOT/migrations" "$WORK/migrations"
  cp "$ROOT/db/ci/selftest_024_shape.sql" "$WORK/migrations/999_ci_selftest_024_shape.sql"
  echo "selftest: seeded 999_ci_selftest_024_shape.sql (024-shaped: nonexistent column + FK to missing row)"
  set +e
  ( cd "$WORK" && DATABASE_URL="$DB_URL" npx tsx "$ROOT/scripts/migrate.ts" ) > "$WORK/migrate.log" 2>&1
  rc=$?
  set -e
  sed -n '1,60p' "$WORK/migrate.log"
  if [ "$rc" -eq 0 ]; then
    echo "::error title=Migration dry-run self-test FAILED::the seeded 024-shaped migration applied cleanly — this job would NOT have caught the 2026-07-18 incident class. Do not trust the green above."
    exit 1
  fi
  if ! grep -q '999_ci_selftest_024_shape' "$WORK/migrate.log"; then
    echo "::error title=Self-test aborted for the wrong reason::migrate.ts failed before reaching the seeded fixture — inspect the log above."
    exit 1
  fi
  echo "SELF-TEST PASS: migrator aborted on the seeded 024-shaped migration (rc=${rc}) — the dry-run catches the incident class."
else
  DATABASE_URL="$DB_URL" npx tsx "$ROOT/scripts/migrate.ts"
  echo "PASS: pending migration set applies cleanly against the prod schema snapshot."
fi
