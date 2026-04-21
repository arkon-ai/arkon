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
--   1. Preserve ALL existing consumers FIRST (warden_bridge + arkonhelm +
--      wael_writer legacy — see pre-apply probes 2026-04-21 below)
--   2. wael_writer_lumina CREATE ROLE + policy SECOND  (new writer)
--   3. ALTER TABLE ENABLE RLS LAST  (enforces policies)
--   4. Verify + negative-test (see block-comment at bottom)
--
-- PRE-APPLY PROBES (2026-04-21, laptop-Warden) — why the STEP 1 list grew:
--   - arkonhelm has SELECT on worker_activity_events with 6 active
--     connections from the Arkon Next.js app (100.108.57.71). Without
--     a SELECT policy, all Arkon reads of WAEL return 0 rows after RLS.
--   - wael_writer (previously audited as "unused legacy") is ACTIVELY used
--     by ~brynn/wael-sdk-py/ systemd timers on HOFMI-EU-OPEN, shipped
--     2026-04-17. Every ~5.5 min both lumina + sentinel heartbeats flow
--     via this role. Without a permissive INSERT policy, those heartbeats
--     fail on RLS flip.
--
-- PRE-APPLY CHECKLIST:
--   [ ] Password for wael_writer_lumina generated via the apply script (pwgen
--       inside ~/.claude/plans/2.1-apply-commands.sh) and set in Infisical at
--       /shared-fleet/lumina/MISSION_CONTROL_WAEL_DSN (env=prod) at apply time.
--   [ ] Pre-apply: SELECT worker_id, COUNT(*) FROM worker_activity_events
--          WHERE ts > NOW() - INTERVAL '1 hour' GROUP BY worker_id;
--       — record counts per worker_id (warden_bridge, wael_writer via
--       lumina/sentinel) so the post-apply smoke can confirm live writes
--       continue across all three existing consumers.
--   [ ] Post-apply: within 15 min, verify counts grow for warden (via bridge)
--       and lumina+sentinel (via wael_writer legacy). See tests 3 + 6 below.
--
-- ROLLBACK PATH:
--   ALTER TABLE worker_activity_events DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS warden_bridge_wael_insert    ON worker_activity_events;
--   DROP POLICY IF EXISTS warden_bridge_wael_select    ON worker_activity_events;
--   DROP POLICY IF EXISTS arkonhelm_wael_select        ON worker_activity_events;
--   DROP POLICY IF EXISTS wael_writer_insert    ON worker_activity_events;
--   DROP POLICY IF EXISTS wael_writer_lumina_insert    ON worker_activity_events;
--   -- Keep the wael_writer_lumina ROLE (harmless, has no grants without RLS)
--   -- or DROP ROLE IF EXISTS wael_writer_lumina; (after revoking grants)

\set ON_ERROR_STOP on

BEGIN;

-- =========================================================================
-- STEP 1 — Preserve ALL existing consumers BEFORE enabling RLS
-- =========================================================================
-- Three roles currently hold grants on worker_activity_events (confirmed
-- via \dp 2026-04-21):
--   warden_bridge  INSERT + SELECT   — bridge on HOFMI-TEAM-1
--   wael_writer    INSERT            — wael-sdk-py timers on HOFMI-EU-OPEN
--                                      (shipped 2026-04-17, 11 lumina + 11
--                                      sentinel events/hour at probe time)
--   arkonhelm      SELECT            — Arkon Next.js app DB role
--                                      (6 active connections at probe time)
--
-- With RLS enabled, grants alone are insufficient — every access must also
-- pass a matching policy's USING / WITH CHECK. Each of the three policies
-- below mirrors the role's CURRENT behavior, so the RLS flip is a
-- zero-regression operation. New per-agent scoping (wael_writer_lumina) is
-- layered on in STEP 2; the wael_writer → wael_writer_lumina migration for
-- the existing systemd timer happens out-of-band as a later cutover.

-- 1a. warden_bridge INSERT — bridge writes warden + codesmith rows.
CREATE POLICY warden_bridge_wael_insert
  ON worker_activity_events
  FOR INSERT
  TO warden_bridge
  WITH CHECK (worker_id IN ('warden', 'codesmith'));

-- 1b. warden_bridge SELECT — bridge reads WAEL via MCP worker_activity_recent.
CREATE POLICY warden_bridge_wael_select
  ON worker_activity_events
  FOR SELECT
  TO warden_bridge
  USING (TRUE);

-- 1c. arkonhelm SELECT — Arkon Next.js app reads WAEL for the fleet dashboard,
--     agents screen, and any MC feature that surfaces worker activity.
--     Permissive read of all agents' events (matches current pre-RLS behavior).
CREATE POLICY arkonhelm_wael_select
  ON worker_activity_events
  FOR SELECT
  TO arkonhelm
  USING (TRUE);

-- 1d. wael_writer INSERT (legacy, but actively used) — preserve writes from
--     ~brynn/wael-sdk-py/ systemd timers on HOFMI-EU-OPEN for lumina and
--     sentinel heartbeats. Scoped to the two worker_ids currently observed
--     so the legacy role can't be used to impersonate warden or codesmith.
--     If a future non-heartbeat writer adds a new worker_id via this role,
--     the INSERT will fail with policy reject (deliberate — catches drift).
CREATE POLICY wael_writer_insert
  ON worker_activity_events
  FOR INSERT
  TO wael_writer
  WITH CHECK (worker_id IN ('lumina', 'sentinel'));

-- =========================================================================
-- STEP 2 — Create wael_writer_lumina role + INSERT policy
-- =========================================================================
-- Password is staged for Infisical separately; the placeholder below is
-- replaced at apply time via:
--   psql -v lumina_pw="$(pwgen -s 40 1)" -f 2026-04-21_wael_rls_phase2_1.sql
--
-- If running this file raw (without -v), swap the :'lumina_pw' token for a
-- quoted literal first.

-- AMENDMENT 2026-04-21 (warden-hub apply): the original DO block used
-- :'lumina_pw' inside a $$..$$ dollar-quoted body. psql variable
-- substitution does NOT descend into dollar-quoted strings, so the colon
-- reached the server literally and raised "syntax error at or near ':'".
-- Pre-apply probe confirmed wael_writer_lumina does not exist, so the
-- idempotency guard is not needed for this apply. Direct CREATE ROLE used.
-- If re-applying (e.g. on a fresh env), add a prior
--   \if :{?existing_role} ... \endif
-- guard outside a DO block, or drop-and-recreate explicitly.

CREATE ROLE wael_writer_lumina LOGIN PASSWORD :'lumina_pw';

GRANT CONNECT ON DATABASE mission_control TO wael_writer_lumina;
GRANT USAGE ON SCHEMA public TO wael_writer_lumina;
GRANT INSERT ON TABLE worker_activity_events TO wael_writer_lumina;
-- AMENDMENT 2026-04-21 (post-apply smoke caught this): the table's primary
-- key is `id bigint DEFAULT nextval('worker_activity_events_id_seq')`, so any
-- INSERT that doesn't supply `id` explicitly needs USAGE on the sequence.
-- wael_writer and warden_bridge both had this pre-apply (which is why their
-- writes worked). wael_writer_lumina needs it too.
GRANT USAGE ON SEQUENCE worker_activity_events_id_seq TO wael_writer_lumina;

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
--   - arkonhelm reads continue via arkonhelm_wael_select policy.
--   - wael_writer (legacy) INSERTs continue for worker_id IN ('lumina','sentinel')
--     via wael_writer_insert policy.
--   - wael_writer_lumina can INSERT only worker_id='lumina' rows (new per-agent).
--   - Any other role with prior grants now ALSO needs a policy to read/write.
--     (Confirmed 2026-04-21: the four roles above are the only grantees.)

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
-- 3. Bridge continuity — verify warden_bridge writes still flow. Window
--    widened to 15 minutes based on observed 2026-04-21 cadence (1 warden
--    event/hr is within normal idle range; the 2-min window would false-fail).
--
--    SELECT COUNT(*) FROM worker_activity_events
--     WHERE worker_id IN ('warden','codesmith')
--       AND ts > NOW() - INTERVAL '15 minutes';
--    -- Expected: count > 0 (heartbeats from the bridge process).
--    -- If 0: re-run after waiting 5-10 min before declaring a regression.
--
-- 4. Negative test — warden_bridge CANNOT write as lumina:
--
--    SET ROLE warden_bridge;
--    INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, ts, payload)
--      VALUES (gen_random_uuid(), 'lumina', 'transformate', 'heartbeat', NOW(), '{"smoke":"bridge-cannot-spoof"}'::jsonb);
--    -- Expected: ERROR — warden_bridge policy restricts worker_id IN ('warden','codesmith').
--    RESET ROLE;
--
-- 5. arkonhelm read continuity — Arkon app's fleet dashboard must keep reading.
--
--    SET ROLE arkonhelm;
--    SELECT COUNT(*) FROM worker_activity_events
--     WHERE ts > NOW() - INTERVAL '1 hour';
--    -- Expected: count matches the same query as superuser (no rows hidden by RLS).
--    RESET ROLE;
--
-- 6. wael_writer legacy continuity — wael-sdk-py heartbeats keep flowing.
--    Option A: wait 6+ minutes post-apply and verify timer output:
--
--    SELECT worker_id, COUNT(*) FROM worker_activity_events
--     WHERE ts > NOW() - INTERVAL '6 minutes'
--       AND worker_id IN ('lumina','sentinel')
--     GROUP BY worker_id;
--    -- Expected: at least 1 row each for lumina + sentinel (timer cadence ~5.5 min).
--    -- If 0 after 10 minutes: check ssh brynn@100.90.212.53 "journalctl --user -u wael-heartbeat-lumina.service --since '10 min ago'"
--
--    Option B: direct role test (faster but cleaner with the password-less session):
--
--    SET ROLE wael_writer;
--    INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, ts, payload)
--      VALUES (gen_random_uuid(), 'lumina', 'transformate', 'heartbeat', NOW(), '{"smoke":"wael-writer-legacy-ok"}'::jsonb);
--    -- Expected: success.
--    INSERT INTO worker_activity_events (event_id, worker_id, tenant_id, event_type, ts, payload)
--      VALUES (gen_random_uuid(), 'warden', 'transformate', 'heartbeat', NOW(), '{"smoke":"wael-writer-cannot-spoof-warden"}'::jsonb);
--    -- Expected: ERROR (worker_id='warden' not in policy's WITH CHECK allowlist).
--    RESET ROLE;
--
-- If all 6 pass, the WAEL table is correctly scoped. Sentinel's per-agent role
-- + policy ships as a sibling file (2026-04-21_wael_rls_phase2_3_sentinel.sql)
-- once Lumina's writer proves out per Phase 2.2 §7.
