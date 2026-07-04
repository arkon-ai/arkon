-- Migration 007: Audit Log v2 — full event sourcing model
-- Coexists with audit_log (v1) during transition

CREATE TABLE audit_log_v2 (
  id BIGSERIAL PRIMARY KEY,
  actor_type TEXT NOT NULL,  -- user, agent, system, cron
  actor_id TEXT,
  action TEXT NOT NULL,      -- e.g. user.login, agent.killed, workflow.created
  target_type TEXT,          -- e.g. agent, workflow, user, session
  target_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  old_value JSONB,
  new_value JSONB,
  ip_address TEXT,
  tenant_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_v2_action_time ON audit_log_v2(action, created_at DESC);
CREATE INDEX idx_audit_v2_actor ON audit_log_v2(actor_type, actor_id);
CREATE INDEX idx_audit_v2_target ON audit_log_v2(target_type, target_id);
CREATE INDEX idx_audit_v2_tenant ON audit_log_v2(tenant_id, created_at DESC);

-- Append-only: revoke UPDATE/DELETE from non-superusers
-- Guarded: mcadmin only exists on prod/staging (TimescaleDB superuser role);
-- a clean CI postgres has no such role, so REVOKE...FROM mcadmin would fail
-- with "role does not exist" (42704) before ever reaching this line.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mcadmin') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_log_v2 FROM mcadmin';
  END IF;
END $$;
