-- Migration 022: memory_facts decay sweep — function + retrieval indexes (WI-076)
--
-- The `decay_score` column already exists on memory_facts (see migration 018,
-- which introduced it as DOUBLE PRECISION NOT NULL DEFAULT 1.0). This
-- migration adds:
--
--   1. memory_facts_decay_score(pinned, last_accessed_at, created_at, half_life_days)
--      — pure SQL function that returns the new decay_score for one row.
--   2. memory_facts_apply_decay(half_life_days, tenant_filter)
--      — set-based UPDATE wrapping (1) so callers (cron sweep, ad-hoc reranks)
--      hit the same formula.
--   3. Composite + partial indexes for tenant-scoped score-ordered scans and
--      the eventual prune path.
--
-- Formula: importance × 0.5 ^ (age_days / half_life_days)
--
-- v1 of memory_facts has no `importance` column. We treat pinned rows as
-- importance 2.0 with no age decay (they keep their boost forever) and
-- non-pinned rows as importance 1.0 with the half-life decay applied. If a
-- future migration introduces a real importance column, swap the constants
-- in memory_facts_decay_score for the column read.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Per-row decay score function
-- ─────────────────────────────────────────────────────────────────────────
-- IMMUTABLE-ish: deterministic given the inputs. We mark it STABLE because
-- the *caller* typically passes NOW() through last_accessed_at/created_at
-- comparisons, which depend on the current transaction time.
CREATE OR REPLACE FUNCTION memory_facts_decay_score(
  p_pinned           BOOLEAN,
  p_last_accessed_at TIMESTAMPTZ,
  p_created_at       TIMESTAMPTZ,
  p_half_life_days   DOUBLE PRECISION DEFAULT 30
) RETURNS DOUBLE PRECISION
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT CASE
    WHEN p_pinned THEN 2.0
    ELSE 1.0 * power(
      0.5,
      EXTRACT(EPOCH FROM (NOW() - COALESCE(p_last_accessed_at, p_created_at)))
        / (p_half_life_days * 86400.0)
    )
  END;
$$;

COMMENT ON FUNCTION memory_facts_decay_score(BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, DOUBLE PRECISION)
  IS 'WI-076 decay-score formula: importance × 0.5^(age_days / half_life_days). Pinned rows return 2.0 unconditionally.';

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Set-based sweep wrapper
-- ─────────────────────────────────────────────────────────────────────────
-- Returns the number of rows updated. p_tenant_id NULL means "all tenants".
CREATE OR REPLACE FUNCTION memory_facts_apply_decay(
  p_half_life_days DOUBLE PRECISION DEFAULT 30,
  p_tenant_id      TEXT             DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE memory_facts mf
     SET decay_score = memory_facts_decay_score(
                         mf.pinned,
                         mf.last_accessed_at,
                         mf.created_at,
                         p_half_life_days
                       ),
         updated_at  = NOW()
   WHERE p_tenant_id IS NULL OR mf.tenant_id = p_tenant_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION memory_facts_apply_decay(DOUBLE PRECISION, TEXT)
  IS 'WI-076 sweep wrapper: recomputes decay_score across memory_facts using the half-life formula. Returns rows-updated. Pass NULL tenant_id to sweep all tenants.';

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────
-- Composite index for tenant-scoped score-ordered scans.
-- DESC on decay_score so freshest/strongest facts surface first.
CREATE INDEX IF NOT EXISTS idx_memory_facts_tenant_decay_score
  ON memory_facts (tenant_id, decay_score DESC);

-- Partial index sized for the prune path — only the rows the apply-mode
-- sweep will ever look at (low-score, not-pinned). Keeps full-table scans
-- off the prune query when the table grows.
CREATE INDEX IF NOT EXISTS idx_memory_facts_prune_candidates
  ON memory_facts (tenant_id, decay_score)
  WHERE pinned = false;

-- Down migration (commented; apply manually if rolling back):
-- DROP INDEX IF EXISTS idx_memory_facts_prune_candidates;
-- DROP INDEX IF EXISTS idx_memory_facts_tenant_decay_score;
-- DROP FUNCTION IF EXISTS memory_facts_apply_decay(DOUBLE PRECISION, TEXT);
-- DROP FUNCTION IF EXISTS memory_facts_decay_score(BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, DOUBLE PRECISION);
