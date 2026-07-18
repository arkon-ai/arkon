-- Migration 024: Seed the 'system' agent row required by runtime code paths.
-- Several routes write events with agent_id='system' (admin/crons fallback note,
-- gateway/kill-agent, gateway/stop-gateway, purge); a from-scratch DB (CI) does
-- not have the row, so those inserts violate events_agent_id_fkey and 500.
--
-- WI-1848 (2026-07-18) prod-safety rewrite: the original assumed it was a no-op
-- on prod ("prod has this row") — FALSE by live probe (agents id='system' = 0
-- rows), and the bare INSERT is triple-fatal there: prod agents has no
-- `description` column, token_hash is NOT NULL with no default, and prod has NO
-- 'default' tenant row (fk_agents_tenant). Since migrate.ts aborts the whole
-- run on failure, this blocked every later migration. Now guarded: seeds only
-- where the 'default' tenant exists (from-scratch DBs via 001); genuine no-op
-- on prod. token_hash gets an unusable placeholder (a hash with no known
-- preimage authenticates nothing) to satisfy stricter NOT NULL shapes.
-- Prod's missing system agent is a separate, pre-existing gap needing a tenant
-- decision — tracked in the WI-1848 handback, deliberately NOT seeded here.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM tenants WHERE id = 'default') THEN
    INSERT INTO agents (id, name, description, token_hash, role, tenant_id)
    VALUES ('system', 'System', 'Internal system actor for audit/ops events',
            md5(random()::text || clock_timestamp()::text), 'system', 'default')
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;
