-- 021_solomon_peer_data_layer.sql
-- Solomon peer-agent data layer — Day A (WI-033)
-- Date: 2026-04-24 | Author: Warden
--
-- Apply (requires superuser + password variable):
--   ssh brynn@100.108.57.71 \
--     'docker exec -i mc-postgres psql -U mcadmin -d mission_control \
--      -v ON_ERROR_STOP=1 -v solomon_pw="<generated>" ' \
--     < 021_solomon_peer_data_layer.sql
--
-- Generate password before applying:
--   pwgen -s 40 1
-- Then store in Infisical at /warden/prod/MISSION_CONTROL_SOLOMON_DSN
--
-- ROLLBACK:
--   ALTER TABLE memory_facts DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS warden_bridge_memory_select  ON memory_facts;
--   DROP POLICY IF EXISTS warden_bridge_memory_insert  ON memory_facts;
--   DROP POLICY IF EXISTS warden_bridge_memory_update  ON memory_facts;
--   DROP POLICY IF EXISTS solomon_bridge_memory_select ON memory_facts;
--   DROP POLICY IF EXISTS solomon_bridge_memory_insert ON memory_facts;
--   DROP POLICY IF EXISTS solomon_bridge_memory_update ON memory_facts;
--   DROP POLICY IF EXISTS solomon_bridge_wael_insert   ON worker_activity_events;
--   DROP POLICY IF EXISTS solomon_bridge_wael_select   ON worker_activity_events;
--   DROP TABLE IF EXISTS solomon_messages;
--   DROP TABLE IF EXISTS solomon_sessions;
--   DELETE FROM agent_identities WHERE slug = 'solomon';
--   REVOKE ALL ON ALL TABLES IN SCHEMA public FROM solomon_bridge;
--   REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM solomon_bridge;
--   DROP ROLE IF EXISTS solomon_bridge;

\set ON_ERROR_STOP on

BEGIN;

-- =====================================================================
-- 1. agent_identities: seed solomon
--    Required before creating solomon_messages (FK on author_agent)
--    and before memory_facts RLS policies reference 'solomon' literal.
-- =====================================================================
INSERT INTO agent_identities (
  slug, tenant_id, display_name, role, emoji,
  model, home_server, description, harness, active
) VALUES (
  'solomon', 'transformate', 'Solomon', 'governor', '🕯️',
  'claude-opus-4-7', 'brynn-bendixen-G5-5587',
  'Full peer agent — autonomous business strategy, CEO-level decision framework, anti-sycophancy checks',
  'agent-sdk', TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  role         = EXCLUDED.role,
  emoji        = EXCLUDED.emoji,
  model        = EXCLUDED.model,
  home_server  = EXCLUDED.home_server,
  description  = EXCLUDED.description,
  harness      = EXCLUDED.harness,
  active       = EXCLUDED.active,
  updated_at   = NOW();

-- =====================================================================
-- 2. solomon_sessions — exact mirror of warden_sessions
--    Surface set adapted to Solomon's deployment on Dell G5.
-- =====================================================================
CREATE TABLE IF NOT EXISTS solomon_sessions (
  id                 TEXT        NOT NULL,
  tenant_id          TEXT        NOT NULL,
  surface            TEXT        NOT NULL,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at           TIMESTAMPTZ,
  active             BOOLEAN     NOT NULL DEFAULT TRUE,
  session_lock_owner TEXT,
  title              TEXT,
  metadata           JSONB       NOT NULL DEFAULT '{}',
  CONSTRAINT solomon_sessions_pkey       PRIMARY KEY (id),
  CONSTRAINT solomon_sessions_tenant_fk  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT solomon_sessions_surface_check CHECK (surface IN (
    'arkon-chat', 'arkon-pwa', 'discord',
    'claude-code-solomon', 'claude-code-warden-dell-g5', 'cron'
  ))
);

CREATE INDEX IF NOT EXISTS idx_solomon_sessions_tenant ON solomon_sessions (tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_solomon_sessions_recent ON solomon_sessions (tenant_id, last_activity_at DESC);

-- =====================================================================
-- 3. solomon_messages — exact mirror of warden_messages (incl. model col)
-- =====================================================================
CREATE TABLE IF NOT EXISTS solomon_messages (
  id           BIGSERIAL      NOT NULL,
  session_id   TEXT           NOT NULL,
  tenant_id    TEXT           NOT NULL,
  author_agent TEXT           NOT NULL,
  role         TEXT           NOT NULL,
  content      TEXT           NOT NULL,
  tool_calls   JSONB,
  tool_results JSONB,
  tokens_in    INTEGER,
  tokens_out   INTEGER,
  cost_usd     NUMERIC(10,6),
  created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  model        TEXT,
  CONSTRAINT solomon_messages_pkey        PRIMARY KEY (id),
  CONSTRAINT solomon_messages_session_fk  FOREIGN KEY (session_id) REFERENCES solomon_sessions(id) ON DELETE CASCADE,
  CONSTRAINT solomon_messages_tenant_fk   FOREIGN KEY (tenant_id)  REFERENCES tenants(id) ON DELETE CASCADE,
  CONSTRAINT solomon_messages_agent_fk    FOREIGN KEY (author_agent) REFERENCES agent_identities(slug),
  CONSTRAINT solomon_messages_role_check  CHECK (role IN ('user', 'assistant', 'tool', 'system'))
);

CREATE INDEX IF NOT EXISTS idx_solomon_messages_session ON solomon_messages (session_id, created_at);

-- =====================================================================
-- 4. Postgres role: solomon_bridge
--    NOTE: :'solomon_pw' cannot be used inside DO/$$ blocks (psql variable
--    expansion does not descend into dollar-quoted strings). Direct CREATE
--    ROLE is used here, matching the Phase 2.1 pattern (see amendment note
--    in 2026-04-21_wael_rls_phase2_1.sql). Pre-confirm role does not exist
--    before applying; or guard manually if re-applying to a dirty env.
-- =====================================================================
CREATE ROLE solomon_bridge LOGIN PASSWORD :'solomon_pw';

GRANT CONNECT  ON DATABASE mission_control TO solomon_bridge;
GRANT USAGE    ON SCHEMA   public          TO solomon_bridge;

-- Shared lookup
GRANT SELECT ON agent_identities TO solomon_bridge;

-- Audit log
GRANT SELECT, INSERT ON audit_log TO solomon_bridge;

-- Delegation jobs
GRANT SELECT, INSERT, UPDATE ON delegation_jobs TO solomon_bridge;

-- Memory facts (scoped by RLS; policies added in section 5)
GRANT SELECT, INSERT, UPDATE ON memory_facts TO solomon_bridge;

-- VOS read-only (writes go via ArkonOS REST, not direct SQL — mirrors warden_bridge policy)
GRANT SELECT ON vos_agent_configs      TO solomon_bridge;
GRANT SELECT ON vos_attachments        TO solomon_bridge;
GRANT SELECT ON vos_channel_reads      TO solomon_bridge;
GRANT SELECT ON vos_channels           TO solomon_bridge;
GRANT SELECT ON vos_daily_briefings    TO solomon_bridge;
GRANT SELECT ON vos_document_versions  TO solomon_bridge;
GRANT SELECT ON vos_documents          TO solomon_bridge;
GRANT SELECT ON vos_goal_reviews       TO solomon_bridge;
GRANT SELECT ON vos_goals              TO solomon_bridge;
GRANT SELECT ON vos_kb_sources         TO solomon_bridge;
GRANT SELECT, INSERT, UPDATE ON vos_messages TO solomon_bridge;
GRANT SELECT ON vos_mood_entries       TO solomon_bridge;
GRANT SELECT ON vos_notes              TO solomon_bridge;
GRANT SELECT ON vos_prayer_log         TO solomon_bridge;
GRANT SELECT ON vos_projects           TO solomon_bridge;
GRANT SELECT ON vos_prompts            TO solomon_bridge;
GRANT SELECT ON vos_quick_captures     TO solomon_bridge;
GRANT SELECT ON vos_quick_links        TO solomon_bridge;
GRANT SELECT ON vos_scheduled_messages TO solomon_bridge;
GRANT SELECT ON vos_tasks              TO solomon_bridge;
GRANT SELECT ON vos_tenants            TO solomon_bridge;
GRANT SELECT ON vos_triggers           TO solomon_bridge;
GRANT SELECT ON vos_user_preferences   TO solomon_bridge;
GRANT SELECT ON vos_users              TO solomon_bridge;

-- Work tracking (full r/w, mirrors warden_bridge)
GRANT SELECT, INSERT ON work_entries             TO solomon_bridge;
GRANT SELECT, INSERT ON work_item_plan_log       TO solomon_bridge;
GRANT SELECT, INSERT, UPDATE ON work_item_postmortems TO solomon_bridge;
GRANT SELECT, INSERT, UPDATE ON work_items       TO solomon_bridge;

-- WAEL: SELECT + scoped INSERT (RLS policy added in section 6)
GRANT SELECT, INSERT ON worker_activity_events TO solomon_bridge;

-- Solomon's own session tables: full r/w
GRANT SELECT, INSERT, UPDATE ON solomon_sessions TO solomon_bridge;
GRANT SELECT, INSERT         ON solomon_messages TO solomon_bridge;

-- Warden governor reads Solomon's sessions (asymmetric: Solomon does NOT get
-- SELECT on warden_sessions / warden_messages — intentional)
GRANT SELECT ON solomon_sessions TO warden_bridge;
GRANT SELECT ON solomon_messages TO warden_bridge;

-- Sequences (only for tables solomon_bridge INSERTs into)
GRANT USAGE ON SEQUENCE solomon_messages_id_seq        TO solomon_bridge;
GRANT USAGE ON SEQUENCE audit_log_id_seq               TO solomon_bridge;
GRANT USAGE ON SEQUENCE delegation_jobs_id_seq         TO solomon_bridge;
GRANT USAGE ON SEQUENCE work_entries_id_seq            TO solomon_bridge;
GRANT USAGE ON SEQUENCE work_item_plan_log_id_seq      TO solomon_bridge;
GRANT USAGE ON SEQUENCE work_item_postmortems_id_seq   TO solomon_bridge;
GRANT USAGE ON SEQUENCE work_items_id_seq              TO solomon_bridge;
GRANT USAGE ON SEQUENCE worker_activity_events_id_seq  TO solomon_bridge;

-- =====================================================================
-- 5. memory_facts RLS
--    Currently no RLS (confirmed 2026-04-24 probe: rowsecurity=f).
--    Only grantee with existing grants: warden_bridge (SELECT/INSERT/UPDATE).
--    Add policies for BOTH roles BEFORE enabling RLS to avoid a blackout.
-- =====================================================================

-- warden_bridge: preserve full r/w (no restriction on owner_agent)
CREATE POLICY warden_bridge_memory_select ON memory_facts
  FOR SELECT TO warden_bridge USING (TRUE);

CREATE POLICY warden_bridge_memory_insert ON memory_facts
  FOR INSERT TO warden_bridge WITH CHECK (TRUE);

CREATE POLICY warden_bridge_memory_update ON memory_facts
  FOR UPDATE TO warden_bridge USING (TRUE) WITH CHECK (TRUE);

-- solomon_bridge: scoped to owner_agent = 'solomon' only
CREATE POLICY solomon_bridge_memory_select ON memory_facts
  FOR SELECT TO solomon_bridge USING (owner_agent = 'solomon');

CREATE POLICY solomon_bridge_memory_insert ON memory_facts
  FOR INSERT TO solomon_bridge WITH CHECK (owner_agent = 'solomon');

CREATE POLICY solomon_bridge_memory_update ON memory_facts
  FOR UPDATE TO solomon_bridge
  USING     (owner_agent = 'solomon')
  WITH CHECK (owner_agent = 'solomon');

ALTER TABLE memory_facts ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- 6. WAEL RLS: add solomon_bridge policies
--    worker_activity_events already has RLS enabled since Phase 2.1.
--    Existing policies are untouched; solomon's are appended.
-- =====================================================================

CREATE POLICY solomon_bridge_wael_select ON worker_activity_events
  FOR SELECT TO solomon_bridge USING (TRUE);

CREATE POLICY solomon_bridge_wael_insert ON worker_activity_events
  FOR INSERT TO solomon_bridge WITH CHECK (worker_id = 'solomon');

-- =====================================================================
-- 7. UKR asymmetric scope
--    Audit 2026-04-24: NO ukr_* tables exist in mission_control.
--    UKR lives entirely in Qdrant (vector DB); the Python toolkit in
--    warden-memory/scripts/ukr/ukr_core.py enforces agent_id namespace
--    filtering at the collection level.
--    Asymmetric invariant (Warden sees Solomon's pins; Solomon does NOT
--    see Warden's) must be enforced in ukr_core.py / MCP tool layer
--    when Solomon's UKR tooling is wired (Day C of the Solomon build).
--    No DDL action required here.
-- =====================================================================

COMMIT;

-- =====================================================================
-- POST-APPLY VERIFICATION (run as mcadmin after COMMIT)
-- =====================================================================
--
-- A. solomon_bridge can insert/select its own session:
--
--   SET ROLE solomon_bridge;
--   INSERT INTO solomon_sessions (id, tenant_id, surface)
--     VALUES ('smoke-sol-01', 'transformate', 'cron');
--   SELECT id, tenant_id, active FROM solomon_sessions WHERE id='smoke-sol-01';
--   RESET ROLE;
--   -- cleanup: DELETE FROM solomon_sessions WHERE id='smoke-sol-01';
--
-- B. solomon_bridge CANNOT read warden_sessions:
--
--   SET ROLE solomon_bridge;
--   SELECT COUNT(*) FROM warden_sessions;
--   -- Expected: ERROR:  permission denied for table warden_sessions
--   RESET ROLE;
--
-- C. memory_facts asymmetric scope:
--
--   SET ROLE solomon_bridge;
--   INSERT INTO memory_facts (tenant_id, owner_agent, kind, body)
--     VALUES ('transformate', 'solomon', 'test', 'solomon smoke');
--   SELECT COUNT(*) FROM memory_facts WHERE owner_agent='warden';
--   -- Expected: 0 (RLS blocks warden rows from solomon_bridge)
--   RESET ROLE;
--   -- cleanup: DELETE FROM memory_facts WHERE owner_agent='solomon' AND kind='test';
--
-- D. warden_bridge still reads ALL memory_facts:
--
--   SET ROLE warden_bridge;
--   SELECT COUNT(*) FROM memory_facts;
--   -- Expected: all rows (permissive policy, no owner_agent filter)
--   RESET ROLE;
--
-- E. solomon_bridge WAEL scoping:
--
--   SET ROLE solomon_bridge;
--   INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, payload)
--     VALUES (gen_random_uuid(), 'solomon', 'transformate', 'heartbeat', '{"smoke":"rls"}'::jsonb)
--     RETURNING event_id;
--   -- Expected: one event_id returned
--   INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, payload)
--     VALUES (gen_random_uuid(), 'warden', 'transformate', 'heartbeat', '{"smoke":"spoof"}'::jsonb);
--   -- Expected: ERROR new row violates row-level security policy
--   RESET ROLE;
