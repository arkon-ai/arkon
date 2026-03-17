-- Migration 001: Multi-tenancy — tenants table + tenant_id on agents
-- Creates tenant isolation for client deployments

-- 1. Create tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  plan TEXT NOT NULL DEFAULT 'starter',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create default tenant (created by setup wizard on first run)
INSERT INTO tenants (id, name, plan)
VALUES ('default', 'Default', 'owner')
ON CONFLICT (id) DO NOTHING;

-- 3. Add tenant_id column to agents (nullable first for safe migration)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- 4. Assign existing agents to default tenant
UPDATE agents SET tenant_id = 'default' WHERE tenant_id IS NULL;

-- 5. Make tenant_id NOT NULL now that all rows have a value
ALTER TABLE agents ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE agents ALTER COLUMN tenant_id SET DEFAULT 'default';

-- 6. Add foreign key constraint
ALTER TABLE agents ADD CONSTRAINT fk_agents_tenant
  FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE;

-- 7. Add tenant_id to daily_stats for efficient tenant-scoped queries
ALTER TABLE daily_stats ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE daily_stats ds SET tenant_id = a.tenant_id
  FROM agents a WHERE ds.agent_id = a.id AND ds.tenant_id IS NULL;
UPDATE daily_stats SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE daily_stats ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE daily_stats ALTER COLUMN tenant_id SET DEFAULT 'default';

-- 8. Add tenant_id to sessions
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE sessions s SET tenant_id = a.tenant_id
  FROM agents a WHERE s.agent_id = a.id AND s.tenant_id IS NULL;
UPDATE sessions SET tenant_id = 'default' WHERE tenant_id IS NULL;
ALTER TABLE sessions ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE sessions ALTER COLUMN tenant_id SET DEFAULT 'default';

-- 9. Indexes for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant ON daily_stats(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sessions_tenant ON sessions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_events_agent_created ON events(agent_id, created_at DESC);
