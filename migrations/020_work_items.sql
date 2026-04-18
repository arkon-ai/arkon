-- Migration 020: Work Item System v1 (WI-001)
-- Purpose: unified tracker for every piece of work across Brynn + Warden + Codesmith +
--          Lumina + Sentinel + future HOFMI team members. Covers all types (code /
--          research / content / ops / decision) with proposal → plan → execution-changelog
--          → completion lifecycle. Tier-based rigor (T1/T2/T3), impact-scored autonomy,
--          Definition-of-Done gates, postmortem hook.
--
-- Sibling to work_entries (017) — does NOT modify or replace it. work_entries stays as
-- the short-term journal; work_items is the structured project layer. A work_item MAY
-- reference work_entries via deliverable_refs / plan-log, but does not FK to them.
--
-- Conventions match 017/018:
--   - BIGSERIAL ids (friendly WI-NNN numbering for CLI UX)
--   - TEXT + CHECK IN (...) for enums (easier to evolve than pg enum types)
--   - FK owner/author to agent_identities(slug) — brynn is already a governor slug
--   - TIMESTAMPTZ with NOW() defaults
--   - JSONB NOT NULL DEFAULT for structured blobs
--   - IF NOT EXISTS guards for safe re-run
--
-- Depends on: 000 (tenants), 017 (agent_identities).

BEGIN;

-- ============================================================
-- 1. work_items — the core record
-- ============================================================
CREATE TABLE IF NOT EXISTS work_items (
  id                BIGSERIAL PRIMARY KEY,
  tenant_id         TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,

  -- content
  title             TEXT NOT NULL,
  description       TEXT,

  -- classification
  tier              TEXT NOT NULL CHECK (tier IN ('T1','T2','T3')),
  type              TEXT NOT NULL CHECK (type IN ('code','research','content','ops','decision')),
  status            TEXT NOT NULL DEFAULT 'proposed'
                      CHECK (status IN ('proposed','planned','in_progress','review','done','blocked','abandoned','failed')),

  -- ownership (agent_identities includes brynn as 'governor' role, so humans + agents use same FK)
  owner_agent       TEXT REFERENCES agent_identities(slug),
  proposing_agent   TEXT REFERENCES agent_identities(slug),

  -- scoring
  impact_score      SMALLINT CHECK (impact_score BETWEEN 0 AND 10),
  impact_breakdown  JSONB NOT NULL DEFAULT '{}'::jsonb,   -- {blast_radius, reversibility, tier_touched, cost, external_visibility}
  risk              TEXT CHECK (risk IN ('low','med','high')),

  -- artifacts
  plan_doc_path     TEXT,                                  -- warden-memory/plans/WI-NNN-<slug>.md; migrates to UKR doc id post-WI-005
  deliverable_refs  JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{kind, url, sha, doc_id, ...}]
  rollback_command  TEXT,
  dod_checklist     JSONB NOT NULL DEFAULT '[]'::jsonb,    -- [{item, checked, checked_at, checked_by, evidence_url}]

  -- organization
  tags              TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  depends_on        BIGINT[] NOT NULL DEFAULT ARRAY[]::BIGINT[],  -- work_items.id references (soft — no FK on arrays)

  -- lifecycle
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  duration_seconds  INTEGER GENERATED ALWAYS AS (
    CASE
      WHEN started_at IS NOT NULL AND completed_at IS NOT NULL
        THEN EXTRACT(EPOCH FROM (completed_at - started_at))::INTEGER
      ELSE NULL
    END
  ) STORED,

  -- completion
  outcome           TEXT CHECK (outcome IN ('success','failure','partial'))
);

CREATE INDEX IF NOT EXISTS idx_work_items_tenant      ON work_items(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_items_status      ON work_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_work_items_owner       ON work_items(owner_agent, status) WHERE owner_agent IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_items_tier        ON work_items(tier, status);
CREATE INDEX IF NOT EXISTS idx_work_items_tags        ON work_items USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_work_items_depends_on  ON work_items USING GIN(depends_on);

-- updated_at trigger
CREATE OR REPLACE FUNCTION work_items_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_items_touch_updated_at ON work_items;
CREATE TRIGGER trg_work_items_touch_updated_at
  BEFORE UPDATE ON work_items
  FOR EACH ROW EXECUTE FUNCTION work_items_touch_updated_at();

-- ============================================================
-- 2. work_item_plan_log — append-only execution timeline
-- ============================================================
-- Every significant event on a work_item (proposal, plan change, step, commit,
-- delegation dispatch/result, outcome, status flip) gets one row here. UI renders
-- a chronological timeline in the Work Item detail panel.
CREATE TABLE IF NOT EXISTS work_item_plan_log (
  id                    BIGSERIAL PRIMARY KEY,
  work_item_id          BIGINT NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  ts                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  author                TEXT NOT NULL REFERENCES agent_identities(slug),
  kind                  TEXT NOT NULL
                          CHECK (kind IN ('proposal','change','step','commit','delegation','outcome','status_change','dod_check')),
  body                  TEXT NOT NULL,
  linked_sha            TEXT,           -- git commit SHA, populated by post-commit hook
  linked_delegation_id  UUID,           -- delegation_jobs.id, populated by bridge on delegate completion
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_wipl_work_item  ON work_item_plan_log(work_item_id, ts DESC);
CREATE INDEX IF NOT EXISTS idx_wipl_author     ON work_item_plan_log(author, ts DESC);
CREATE INDEX IF NOT EXISTS idx_wipl_kind       ON work_item_plan_log(kind, ts DESC);
CREATE INDEX IF NOT EXISTS idx_wipl_delegation ON work_item_plan_log(linked_delegation_id) WHERE linked_delegation_id IS NOT NULL;

-- Append-only: no UPDATE or DELETE triggers, no updated_at. UI / CLI enforce by convention.

-- ============================================================
-- 3. work_item_postmortems — failure capture (one per failed WI)
-- ============================================================
CREATE TABLE IF NOT EXISTS work_item_postmortems (
  id                    BIGSERIAL PRIMARY KEY,
  work_item_id          BIGINT NOT NULL UNIQUE REFERENCES work_items(id) ON DELETE CASCADE,
  ts                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  author                TEXT NOT NULL REFERENCES agent_identities(slug),
  what_happened         TEXT NOT NULL,
  root_cause            TEXT NOT NULL,
  fix                   TEXT NOT NULL,
  lesson_for_future     TEXT NOT NULL,
  synced_to_ukr_doc_id  TEXT            -- populated once Phase 1.5 UKR ships (WI-005)
);

CREATE INDEX IF NOT EXISTS idx_wipm_work_item ON work_item_postmortems(work_item_id);

-- ============================================================
-- 4. Comments (annotate for future readers / psql \d introspection)
-- ============================================================
COMMENT ON TABLE  work_items IS
  'WI-001: Unified work tracking. Sibling of work_entries. Every piece of work (code/research/content/ops/decision) flows through this table with tier-based rigor and DoD gates.';
COMMENT ON COLUMN work_items.impact_breakdown IS
  '5-axis scoring blob: {blast_radius:0-2, reversibility:0-2, tier_touched:0-2, cost:0-2, external_visibility:0-2}. Sum drives impact_score 0-10.';
COMMENT ON COLUMN work_items.dod_checklist IS
  'Array of {item, checked:bool, checked_at, checked_by, evidence_url}. All items must be checked before status can flip to done.';
COMMENT ON COLUMN work_items.depends_on IS
  'Soft-FK array of work_items.id. Validated at flip time, not at insert time. GIN-indexed for reverse-dependency lookups.';

COMMENT ON TABLE  work_item_plan_log IS
  'WI-001: Append-only timeline per work_item. Writes: CLI, bridge (on task_completed), git post-commit hook, delegation worker.';
COMMENT ON COLUMN work_item_plan_log.kind IS
  'proposal=initial brief · change=plan amendment · step=manual progress note · commit=git SHA appended · delegation=dispatch/result · outcome=success/failure text · status_change=flip · dod_check=checkbox tick';

COMMENT ON TABLE work_item_postmortems IS
  'WI-001: One postmortem per failed work_item. Feeds UKR learning layer (WI-005) via synced_to_ukr_doc_id after Phase 1.5 ships.';

-- ============================================================
-- 5. Record migration
-- ============================================================
INSERT INTO _migrations (name, applied_at) VALUES ('020_work_items.sql', NOW())
  ON CONFLICT (name) DO NOTHING;

COMMIT;

-- ─── Verify ──────────────────────────────────────────────────────────────
SELECT relname, n_live_tup
  FROM pg_stat_user_tables
 WHERE relname IN ('work_items','work_item_plan_log','work_item_postmortems')
 ORDER BY relname;
