# db/prod-snapshot — schema-only snapshot of arkon prod (mission_control)

**What this is.** A `pg_dump --schema-only` of the production database plus a minimal
reference-data seed, checked in so CI can dry-run every pending migration against the
REAL prod schema (`.github/workflows/migration-dryrun.yml`,
`scripts/ci/migration-dryrun.sh`). CI runners cannot reach the tailnet, so the snapshot
is captured fleet-side and committed.

**Why (transformate WI-2075, under WI-1847).** On 2026-07-18, migration
`024_seed_system_agent.sql` was CI-green (CI builds its DB from `000_base_schema.sql`,
which had drifted from prod) and fatal on prod three independent ways — it sat
merged-but-undeployable in front of the queue, blocking 025-028. #90/#91 fixed that
instance reactively (000 parity for `agents`/`sessions`, guarded 024, added 029); this
snapshot + the dry-run job are the permanent prevention for the class.

## Files

| File | Contents | Data? |
|---|---|---|
| `schema.sql.gz` | `pg_dump --schema-only --no-owner --no-privileges` of `mission_control`, gzipped (a ~550KB wholesale-regenerated DDL artifact; text diffs of refreshes are pure noise, and the plain text bloats repo + review surfaces). Sanitize the PLAINTEXT, then gzip. | none |
| `seed.sql` | `pg_dump --data-only --column-inserts` of **only** `public._migrations` (which migrations prod has applied) and `public.tenants` (reference rows so FK-seeding migrations behave prod-like). Kept PLAINTEXT deliberately — it is the only file that can carry row data, so it stays human-reviewable in every PR. | those 2 tables only |
| `META.txt` | `captured_at=<ISO-8601 UTC>`, source, PG/timescale versions, prod HEAD at capture, sanitization notes | none |

**Sanitization contract:** `seed.sql` must contain INSERTs for `public._migrations` and
`public.tenants` ONLY; `admin_email` values are redacted to NULL; the `metadata` jsonb
values are eyeballed for credential-shaped content; and neither file may contain
credentials, tokens, webhook URLs, or row data beyond those two tables. Verify on the
PLAINTEXT before gzipping/committing (checklist below).

## Refresh procedure (RUNBOOK — do this on each deploy)

Deploy runbook step (per WI-2075): **refresh this snapshot as part of every arkon prod
deploy**, after migrations have applied. CI warns (never fails) when the snapshot is
older than 14 days. Any tailnet host with SSH to Hetzner EU can run it:

```bash
# 1. Capture (read-only on prod)
ssh brynn@100.108.57.71 "docker exec mc-postgres pg_dump -U mcadmin -d mission_control \
  --schema-only --no-owner --no-privileges" > db/prod-snapshot/schema.sql
ssh brynn@100.108.57.71 "docker exec mc-postgres pg_dump -U mcadmin -d mission_control \
  --data-only --column-inserts --table=public._migrations --table=public.tenants" \
  > db/prod-snapshot/seed.sql

# 2. Rewrite META.txt — emit ALL keys (captured_at= is parsed by CI's staleness guard;
#    the rest are the provenance/audit fields this README's Files table promises)
{
  echo "captured_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "source=mc-postgres/mission_control @ 100.108.57.71 (Hetzner EU)"
  ssh brynn@100.108.57.71 "docker exec mc-postgres psql -U mcadmin -d mission_control -tAc 'SELECT version();'" | sed 's/^/pg_version=/'
  ssh brynn@100.108.57.71 "docker exec mc-postgres psql -U mcadmin -d mission_control -tAc \"SELECT extversion FROM pg_extension WHERE extname='timescaledb';\"" | sed 's/^/timescaledb_version=/'
  ssh brynn@100.108.57.71 "git -C ~/arkon log -1 --format='prod_head=%H %cI'"
  ssh brynn@100.108.57.71 "docker exec mc-postgres psql -U mcadmin -d mission_control -tAc 'SELECT COUNT(*) FROM _migrations;'" | sed 's/^/applied_migrations=/'
  echo "capture_method=pg_dump --schema-only --no-owner --no-privileges; --data-only --column-inserts --table=public._migrations --table=public.tenants"
  echo "sanitization=admin_email values redacted to NULL; metadata jsonb eyeballed; INSERTs scoped to public._migrations + public.tenants (verified in step 3)"
} > db/prod-snapshot/META.txt
# If the CI image pin (.github/workflows/migration-dryrun.yml services.timescaledb.image)
# no longer matches the captured timescaledb_version/pg line, bump it in the same PR.

# 3. Sanitize the PLAINTEXT (all must hold before gzipping)
grep -oE '^INSERT INTO [a-z._]+' db/prod-snapshot/seed.sql | sort -u   # ONLY public._migrations + public.tenants
sed -i -E "s/'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'/NULL/g" db/prod-snapshot/seed.sql  # redact admin_email PII
grep -c '@' db/prod-snapshot/seed.sql                                  # must be 0
grep -ciE 'password|secret|api_key' db/prod-snapshot/schema.sql        # identifiers only — eyeball any hits
gitleaks detect --no-git -s db/prod-snapshot 2>/dev/null || echo "run gitleaks if available"

# 4. Gzip the schema (sanitized-plaintext -> committed artifact), keep seed.sql plaintext
gzip -9 -n -f db/prod-snapshot/schema.sql   # produces schema.sql.gz

# 5. Commit on the deploy's branch/PR
git add db/prod-snapshot && git commit -m "chore(db): refresh prod schema snapshot (transformate WI-2075)"
```

**No fleet cron on purpose:** WI-2075 deliberately keeps refresh manual-in-runbook +
CI staleness warning. If refresh toil proves real, file a follow-up proposal WI citing
transformate WI-2075 — do not bolt fleet infra onto this repo.

## How CI consumes it

`scripts/ci/migration-dryrun.sh` restores `schema.sql.gz` (gunzipped on the fly) +
`seed.sql` into a fresh database (timescale image; hypertables restore as plain tables —
fine for abort-class detection), realigns the `_migrations` id sequence, then:

- **real** mode: runs `scripts/migrate.ts` — the actual pending set must apply cleanly;
- **selftest** mode: seeds `db/ci/selftest_024_shape.sql` as `999_ci_selftest_024_shape.sql`
  and requires the migrator to ABORT (exit≠0 naming the fixture) — every run re-proves
  the job catches the 024 class.

Known limits (accepted): schema-only means data-dependent migrations (backfills over
rows, FK references to prod rows outside `tenants`) are not fully exercised; the
snapshot is as fresh as its last refresh — hence the runbook step + staleness warning.
