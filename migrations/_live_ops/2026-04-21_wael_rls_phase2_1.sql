-- Phase 2.1 — WAEL role + RLS provisioning (LIVE OPS, not an Arkon migration)
-- Target: mission_control @ 100.108.57.71 (docker exec mc-postgres)
-- Date authored: 2026-04-21 · Author: Warden · Status: DRAFT — NOT APPLIED
--
-- This file is applied out-of-band via:
--   ssh brynn@100.108.57.71 'docker exec -i mc-postgres psql -U mcadmin -d mission_control -v ON_ERROR_STOP=1' < 2026-04-21_wael_rls_phase2_1.sql
--
-- It is NOT a versioned Arkon migration because:
--   (a) it touches DB roles/privileges (superuser op, not Arkon-owned)
--   (b) the password is injected via psql variable, not stored in the repo
--   (c) it's transactional but role creation is NOT rolled back by ROLLBACK in some PG
--       versions — confirm idempotency of CREATE ROLE IF NOT EXISTS before apply.
--
-- ORDERING (critical — do NOT reorder):
--   1. warden_bridge protective policy FIRST  (so existing writes keep working)
--   2. wael_writer_lumina CREATE ROLE + policy SECOND  (new writer)
--   3. ALTER TABLE ENABLE RLS LAST  (enforces policies)
--   4. Verify + negative-test (see block-comment at bottom)
--
-- PRE-APPLY CHECKLIST:
--   [ ] Password for wael_writer_lumina generated and staged for Infisical
--       (/shared-fleet/lumina/mission_control_dsn) — NOT yet committed here.
--   [ ] Pre-apply: SELECT COUNT(*) FROM worker_activity_events WHERE ts > NOW() - INTERVAL '5 min';
--       — record count so the post-apply smoke can confirm live writes continue.
--   [ ] Post-apply: within 2 min, verify count grows (proves warden_bridge still writes).
--
-- ROLLBACK PATH:
--   ALTER TABLE worker_activity_events DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS warden_bridge_wael_insert ON worker_activity_events;
--   DROP POLICY IF EXISTS wael_writer_lumina_insert ON worker_activity_events;
--   -- Keep the wael_writer_lumina ROLE (harmless, has no grants without RLS)
--   -- or DROP ROLE IF EXISTS wael_writer_lumina; (after revoking grants)

\set ON_ERROR_STOP on

BEGIN;

-- =========================================================================
-- STEP 1 — Protect existing writer (warden_bridge) BEFORE enabling RLS
-- =========================================================================
-- warden_bridge already has INSERT + SELECT on worker_activity_events (granted
-- by migration 015 or earlier). With RLS enabled, grants alone are insufficient
-- — every row must also pass a matching policy's USING / WITH CHECK. This
-- policy mirrors the bridge's current behavior: warden_bridge writes rows for
-- worker_id IN ('warden', 'codesmith').

CREATE POLICY warden_bridge_wael_insert
  ON worker_activity_events
  FOR INSERT
  TO warden_bridge
  WITH CHECK (worker_id IN ('warden', 'codesmith'));

-- warden_bridge also needs SELECT under RLS (the bridge reads WAEL via the MCP
-- worker_activity_recent tool). Permissive SELECT policy.

CREATE POLICY warden_bridge_wael_select
  ON worker_activity_events
  FOR SELECT
  TO warden_bridge
  USING (TRUE);  -- bridge can read all agents' events

-- =========================================================================
-- STEP 2 — Create wael_writer_lumina role + INSERT policy
-- =========================================================================
-- Password is staged for Infisical separately; the placeholder below is
-- replaced at apply time via:
--   psql -v lumina_pw="$(pwgen -s 40 1)" -f 2026-04-21_wael_rls_phase2_1.sql
--
-- If running this file raw (without -v), swap the :'lumina_pw' token for a
-- quoted literal first.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'wael_writer_lumina') THEN
    EXECUTE format('CREATE ROLE wael_writer_lumina LOGIN PASSWORD %L', :'lumina_pw');
  END IF;
END $$;

GRANT CONNECT ON DATABASE mission_control TO wael_writer_lumina;
GRANT USAGE ON SCHEMA public TO wael_writer_lumina;
GRANT INSERT ON TABLE worker_activity_events TO wael_writer_lumina;

-- RLS: lumina can only write rows where worker_id = 'lumina'. Note: NO SELECT
-- policy is added — Lumina is a write-only role. Cross-agent reads go through
-- the MCP layer (warden_bridge) or the fleet API (admin).

CREATE POLICY wael_writer_lumina_insert
  ON worker_activity_events
  FOR INSERT
  TO wael_writer_lumina
  WITH CHECK (worker_id = 'lumina');

-- =========================================================================
-- STEP 3 — Enable RLS on the table (LAST, after all permissive policies)
-- =========================================================================
-- Once this runs:
--   - Superuser (mcadmin) bypasses RLS (BYPASSRLS attribute) → unaffected.
--   - warden_bridge writes continue via warden_bridge_wael_insert policy.
--   - warden_bridge reads continue via warden_bridge_wael_select policy.
--   - wael_writer_lumina can INSERT only worker_id='lumina' rows.
--   - Any other role with prior grants now ALSO needs a policy to read/write.
--     (Currently only wael_writer exists — unused per 2026-04-21 audit.)

ALTER TABLE worker_activity_events ENABLE ROW LEVEL SECURITY;

-- Optional: FORCE RLS so even the table owner respects policies. Do NOT force
-- for mc_postgres (which may own the table) — leaving it off means the
-- owner retains full access, which is what we want for migration tooling.
-- ALTER TABLE worker_activity_events FORCE ROW LEVEL SECURITY;  -- intentionally OFF

COMMIT;

-- =========================================================================
-- POST-APPLY VERIFICATION (run AFTER commit; comments for reviewer)
-- =========================================================================
--
-- 1. Positive test — wael_writer_lumina can insert its own rows:
--
--    SET ROLE wael_writer_lumina;
--    INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, ts, payload)
--      VALUES (gen_random_uuid(), 'lumina', 'transformate', 'heartbeat', NOW(), '{"smoke":"rls-positive"}'::jsonb)
--      RETURNING event_id;
--    -- Expected: one event_id returned, no error.
--    RESET ROLE;
--
-- 2. Negative test — wael_writer_lumina CANNOT impersonate another agent:
--
--    SET ROLE wael_writer_lumina;
--    INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, ts, payload)
--      VALUES (gen_random_uuid(), 'sentinel', 'transformate', 'heartbeat', NOW(), '{"smoke":"rls-negative"}'::jsonb);
--    -- Expected: ERROR:  new row violates row-level security policy for table "worker_activity_events"
--    -- (SQLSTATE 42501, psycopg2.errors.InsufficientPrivilege)
--    RESET ROLE;
--
-- 3. Bridge continuity — verify warden_bridge writes still flow:
--
--    SELECT COUNT(*) FROM worker_activity_events
--     WHERE worker_id IN ('warden','codesmith')
--       AND ts > NOW() - INTERVAL '2 minutes';
--    -- Expected: count > 0 (heartbeats from the bridge process).
--
-- 4. Negative test — warden_bridge CANNOT write as lumina:
--
--    SET ROLE warden_bridge;
--    INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, ts, payload)
--      VALUES (gen_random_uuid(), 'lumina', 'transformate', 'heartbeat', NOW(), '{"smoke":"bridge-cannot-spoof"}'::jsonb);
--    -- Expected: ERROR — warden_bridge policy restricts worker_id IN ('warden','codesmith').
--    RESET ROLE;
--
-- If all 4 pass, the WAEL table is correctly scoped. Sentinel's role + policy
-- ships as a sibling file (2026-04-21_wael_rls_phase2_3_sentinel.sql) once
-- Lumina's writer proves out per Phase 2.2 §7.
