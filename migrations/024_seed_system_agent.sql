-- Migration 024: Seed the 'system' agent row required by runtime code paths.
-- Several routes write events with agent_id='system' (admin/crons fallback note,
-- gateway/kill-agent, gateway/stop-gateway, purge). Prod has this row (provisioned
-- out-of-band); a from-scratch DB (CI) does not, so those inserts violate
-- events_agent_id_fkey and the requests 500. Idempotent; no-op on prod.
INSERT INTO agents (id, name, description, role, tenant_id)
VALUES ('system', 'System', 'Internal system actor for audit/ops events', 'system', 'default')
ON CONFLICT (id) DO NOTHING;
