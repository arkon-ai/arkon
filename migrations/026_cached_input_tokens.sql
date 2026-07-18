-- WI-1848 (2026-07-18): POST /api/ingest writes cached_input_tokens to both
-- events and daily_stats, but migration 011 only ever added
-- input_tokens/output_tokens — so ingest 500s on a from-scratch DB (E2E CI:
-- input-boundaries + xss-injection edge specs). Prod already has both columns
-- (added out-of-band; verified 2026-07-18) — IF NOT EXISTS no-ops there.

ALTER TABLE events ADD COLUMN IF NOT EXISTS cached_input_tokens integer;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS cached_input_tokens integer DEFAULT 0;
