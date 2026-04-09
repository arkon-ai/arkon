-- Phase 1a: Separate input/output token tracking
-- Applied: 2026-04-09

ALTER TABLE events ADD COLUMN IF NOT EXISTS input_tokens integer;
ALTER TABLE events ADD COLUMN IF NOT EXISTS output_tokens integer;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS input_tokens integer DEFAULT 0;
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0;

-- Backfill historical daily_stats with 60/40 split (best available estimate)
UPDATE daily_stats SET
  input_tokens = ROUND(estimated_tokens * 0.6),
  output_tokens = ROUND(estimated_tokens * 0.4)
WHERE input_tokens = 0 AND estimated_tokens > 0;
