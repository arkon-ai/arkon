-- WI-088: model_pricing cache_creation_multiplier
--
-- Anthropic charges a separate rate for cache-write (cache-creation) tokens:
-- 1.25x the input rate for Sonnet/Haiku, 1.5x for Opus. Until now, model_pricing
-- only stored input / output / cached-read (via cached_input_discount_pct), and
-- callers either approximated cache-creation at 1.25x input or ignored it.
--
-- This migration adds an explicit cache_creation_multiplier column so the bridge
-- + arkon cost-footer can multiply the input rate by the correct per-model
-- factor. Default 1.0 (no extra charge) for non-Anthropic providers; backfill
-- 1.25 / 1.5 for the Anthropic models we track.

ALTER TABLE model_pricing
  ADD COLUMN IF NOT EXISTS cache_creation_multiplier numeric(6,3) NOT NULL DEFAULT 1.0;

COMMENT ON COLUMN model_pricing.cache_creation_multiplier IS
  'Multiplier applied to cost_per_1k_input when billing cache-creation (cache-write) tokens. Anthropic: 1.25 Sonnet/Haiku, 1.5 Opus. Other providers: 1.0 (no extra charge).';

-- Backfill Anthropic Opus rows: 1.5x input rate.
UPDATE model_pricing
   SET cache_creation_multiplier = 1.5
 WHERE provider = 'anthropic'
   AND model_id ILIKE 'claude-opus-%'
   AND cache_creation_multiplier = 1.0;

-- Backfill Anthropic Sonnet rows: 1.25x input rate.
UPDATE model_pricing
   SET cache_creation_multiplier = 1.25
 WHERE provider = 'anthropic'
   AND model_id ILIKE 'claude-sonnet-%'
   AND cache_creation_multiplier = 1.0;

-- Backfill Anthropic Haiku rows: 1.25x input rate.
UPDATE model_pricing
   SET cache_creation_multiplier = 1.25
 WHERE provider = 'anthropic'
   AND model_id ILIKE 'claude-haiku-%'
   AND cache_creation_multiplier = 1.0;
