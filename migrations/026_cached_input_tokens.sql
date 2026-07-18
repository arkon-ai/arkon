-- WI-1848 (2026-07-18): POST /api/ingest writes cached_input_tokens to both
-- events and daily_stats, but migration 011 only ever added
-- input_tokens/output_tokens — so ingest 500s on a from-scratch DB (E2E CI:
-- input-boundaries + xss-injection edge specs). Prod already has both columns
-- (added out-of-band; verified 2026-07-18) — IF NOT EXISTS no-ops there.

ALTER TABLE events ADD COLUMN IF NOT EXISTS cached_input_tokens integer;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS cached_input_tokens integer DEFAULT 0;

-- Where the column pre-exists (prod: added out-of-band, no default, NULL
-- backfill), ingest's ON CONFLICT increment (cached_input_tokens + $n) stays
-- NULL forever on pre-existing rows — the counter never accumulates. Converge
-- default + backfill; idempotent, no-op where 011-style DEFAULT 0 already held.
ALTER TABLE daily_stats ALTER COLUMN cached_input_tokens SET DEFAULT 0;
UPDATE daily_stats SET cached_input_tokens = 0 WHERE cached_input_tokens IS NULL;
