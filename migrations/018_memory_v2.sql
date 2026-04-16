-- Migration 018: Memory v2 — pgvector-backed long-term memory for Warden + governed agents
-- Purpose: durable, searchable, provider-agnostic fact store that agents read/write across sessions.
--          Complements 017's work_entries (short-term journal) with embedding-based recall.
-- Providers: schema standardises on 1536-dim vectors. All supported providers can hit
--            this dim via Matryoshka Representation Learning (MRL) truncation:
--              - Gemini gemini-embedding-001  : native 3072, MRL-truncated to 1536 (verified 2026-04-16)
--              - OpenAI text-embedding-3-small: native 1536 (no truncation needed)
--              - OpenAI text-embedding-3-large: native 3072, MRL-truncated to 1536
--            1536 is below pgvector's 2000-dim HNSW cap, so ANN retrieval stays fast.
--            `embedding_provider` / `embedding_dim` columns carry provenance so we can
--            audit / re-embed if we ever migrate providers.
-- Scope: per-tenant. Safe re-run with IF NOT EXISTS guards.
-- Depends on: 000 (tenants), 017 (work_entries, work_entries_touch_updated_at).

-- ============================================================
-- 1. Extension
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. memory_facts — the fact store itself
-- ============================================================
CREATE TABLE IF NOT EXISTS memory_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_agent TEXT NOT NULL REFERENCES agent_identities(slug),

  -- classification
  kind TEXT NOT NULL,                          -- 'preference' | 'project-context' | 'decision' | 'person' | 'pattern' | etc.

  -- content
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- lineage — soft link back to the journal entry that produced this fact (if any)
  source_entry_id BIGINT REFERENCES work_entries(id) ON DELETE SET NULL,

  -- embedding (1536-dim, any provider via MRL truncation; provenance tracked per-row)
  embedding_provider TEXT,                     -- 'gemini' | 'openai' | 'voyage' | ...
  embedding_dim INTEGER NOT NULL DEFAULT 1536, -- cached for sanity checks / future re-embed
  embedding vector(1536),                      -- fixed dim: HNSW-indexable, MRL-compatible

  -- retention knobs
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  decay_score DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  last_accessed_at TIMESTAMPTZ,

  -- housekeeping
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. Indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_memory_facts_tenant_owner
  ON memory_facts(tenant_id, owner_agent);

CREATE INDEX IF NOT EXISTS idx_memory_facts_tenant_kind
  ON memory_facts(tenant_id, kind);

-- Partial index: pinned facts are looked up often and are a small slice of the table
CREATE INDEX IF NOT EXISTS idx_memory_facts_pinned
  ON memory_facts(tenant_id, owner_agent)
  WHERE pinned = TRUE;

-- Full-text search over body
CREATE INDEX IF NOT EXISTS idx_memory_facts_body_fts
  ON memory_facts USING GIN (to_tsvector('english', body));

-- ANN index: HNSW if pgvector >= 0.5.0, otherwise fall back to IVFFlat.
-- Both use vector_cosine_ops; callers must use the <=> operator.
DO $$
DECLARE
  v_pgvector_version TEXT;
  v_major INTEGER;
  v_minor INTEGER;
BEGIN
  SELECT extversion INTO v_pgvector_version
    FROM pg_extension WHERE extname = 'vector';

  IF v_pgvector_version IS NULL THEN
    RAISE NOTICE 'pgvector not installed — skipping ANN index';
    RETURN;
  END IF;

  v_major := split_part(v_pgvector_version, '.', 1)::INTEGER;
  v_minor := split_part(v_pgvector_version, '.', 2)::INTEGER;

  IF v_major > 0 OR (v_major = 0 AND v_minor >= 5) THEN
    RAISE NOTICE 'pgvector % detected — creating HNSW index', v_pgvector_version;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_facts_embedding_hnsw
             ON memory_facts USING hnsw (embedding vector_cosine_ops)
             WITH (m = 16, ef_construction = 64)';
  ELSE
    RAISE NOTICE 'pgvector % < 0.5.0 — falling back to IVFFlat', v_pgvector_version;
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_memory_facts_embedding_ivfflat
             ON memory_facts USING ivfflat (embedding vector_cosine_ops)
             WITH (lists = 100)';
  END IF;
END $$;

-- ============================================================
-- 4. updated_at trigger — reuses 017's generic touch function
-- ============================================================
DROP TRIGGER IF EXISTS trg_memory_facts_updated_at ON memory_facts;
CREATE TRIGGER trg_memory_facts_updated_at
  BEFORE UPDATE ON memory_facts
  FOR EACH ROW EXECUTE FUNCTION work_entries_touch_updated_at();

-- ============================================================
-- Rollback (run manually, NOT auto-applied)
-- ============================================================
-- DROP TRIGGER IF EXISTS trg_memory_facts_updated_at ON memory_facts;
-- DROP INDEX IF EXISTS idx_memory_facts_embedding_hnsw;
-- DROP INDEX IF EXISTS idx_memory_facts_embedding_ivfflat;
-- DROP INDEX IF EXISTS idx_memory_facts_body_fts;
-- DROP INDEX IF EXISTS idx_memory_facts_pinned;
-- DROP INDEX IF EXISTS idx_memory_facts_tenant_kind;
-- DROP INDEX IF EXISTS idx_memory_facts_tenant_owner;
-- DROP TABLE IF EXISTS memory_facts;
-- DROP EXTENSION IF EXISTS vector;
