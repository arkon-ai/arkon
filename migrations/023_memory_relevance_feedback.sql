-- Migration 023: memory_facts relevance-feedback loop (WI-079)
--
-- Adds the columns + event table the bridge instrumentation and daily cron
-- aggregator need to bump/decay per-fact importance based on whether a
-- retrieved fact actually got cited in a turn's response.
--
-- Behaviour (implemented in cron/memory-relevance-feedback.mjs):
--   - cited at least once in last 24h           : importance = LEAST(1.0, importance + 0.05)
--   - retrieved-but-not-cited and accumulated
--     unused_retrieval_count >= 5               : importance = importance * 0.95,
--                                                  reset unused_retrieval_count = 0
--   - retrieved-but-not-cited but threshold
--     not yet reached                           : unused_retrieval_count += run delta
--   - pinned = TRUE                             : skipped entirely (immune)
--
-- The existing `decay_score` column (migration 018) is the time-decay product
-- and is recomputed by the WI-076 decay-sweep cron. `importance` is a
-- separate, persistent multiplier mutated only by the relevance-feedback
-- cron. Once both ship, decay-sweep will multiply by `importance` instead
-- of the hard-coded 1.0 it uses today; that follow-up is intentionally not
-- in this migration to keep WI-079's blast radius small.
--
-- Idempotent: re-runnable. No data writes; columns default-populate cleanly.
-- Depends on: 018 (memory_facts).

-- ============================================================
-- 1. memory_facts — relevance-feedback columns
-- ============================================================
ALTER TABLE memory_facts
  ADD COLUMN IF NOT EXISTS importance DOUBLE PRECISION NOT NULL DEFAULT 1.0;

ALTER TABLE memory_facts
  ADD COLUMN IF NOT EXISTS last_retrieved_at TIMESTAMPTZ;

ALTER TABLE memory_facts
  ADD COLUMN IF NOT EXISTS retrieval_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE memory_facts
  ADD COLUMN IF NOT EXISTS unused_retrieval_count INTEGER NOT NULL DEFAULT 0;

-- Defensive cap: the bump path uses LEAST(1.0, importance + 0.05) but a
-- DB-side check makes the invariant explicit and catches any stray writer.
-- 0 is the floor; the decay path will asymptote toward it but never go below.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'memory_facts_importance_range'
  ) THEN
    ALTER TABLE memory_facts
      ADD CONSTRAINT memory_facts_importance_range
      CHECK (importance >= 0.0 AND importance <= 1.0);
  END IF;
END $$;

-- ============================================================
-- 2. memory_retrieval_events — append-only per-turn fact event log
-- ============================================================
-- One row per (turn, fact) combination. `was_cited` is computed by the bridge
-- after the LLM produces its response (substring-match in v1; embedding-sim
-- in v2). The daily cron groups these by fact_id and applies the feedback
-- rules described above.
--
-- No FK to memory_facts.id: a fact can be hard-deleted by the prune path
-- while its events still exist; we keep the events for audit/postmortem
-- and the cron tolerates orphan fact_ids (LEFT JOIN, skip).
CREATE TABLE IF NOT EXISTS memory_retrieval_events (
  id BIGSERIAL PRIMARY KEY,
  turn_id BIGINT,                              -- warden_messages.id (assistant row); nullable so we can record retrievals from non-message contexts
  fact_id UUID NOT NULL,                       -- memory_facts.id (no FK on purpose, see above)
  was_cited BOOLEAN NOT NULL DEFAULT FALSE,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Aggregation index — the cron groups by fact_id over the last 24h.
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_events_fact_time
  ON memory_retrieval_events (fact_id, retrieved_at DESC);

-- Time-only index — used by retention/prune sweeps that drop old event rows.
CREATE INDEX IF NOT EXISTS idx_memory_retrieval_events_retrieved_at
  ON memory_retrieval_events (retrieved_at);

-- ============================================================
-- 3. Grants — warden_bridge needs INSERT on the event log
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warden_bridge') THEN
    EXECUTE 'GRANT SELECT, INSERT ON memory_retrieval_events TO warden_bridge';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE memory_retrieval_events_id_seq TO warden_bridge';
  END IF;
END $$;

-- ============================================================
-- Rollback (run manually, NOT auto-applied)
-- ============================================================
-- DROP INDEX IF EXISTS idx_memory_retrieval_events_retrieved_at;
-- DROP INDEX IF EXISTS idx_memory_retrieval_events_fact_time;
-- DROP TABLE IF EXISTS memory_retrieval_events;
-- ALTER TABLE memory_facts DROP CONSTRAINT IF EXISTS memory_facts_importance_range;
-- ALTER TABLE memory_facts DROP COLUMN IF EXISTS unused_retrieval_count;
-- ALTER TABLE memory_facts DROP COLUMN IF EXISTS retrieval_count;
-- ALTER TABLE memory_facts DROP COLUMN IF EXISTS last_retrieved_at;
-- ALTER TABLE memory_facts DROP COLUMN IF EXISTS importance;
