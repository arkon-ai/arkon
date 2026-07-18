-- WI-1848 (2026-07-18): incidents + incident_updates were created out-of-band
-- on prod (mc-postgres) and never had a migration, so every /api/incidents
-- route 500s on a from-scratch DB (E2E CI). This DDL mirrors the live prod
-- schema exactly (captured 2026-07-18 via read-only probe); IF NOT EXISTS
-- makes it a no-op on prod and creates the tables everywhere else.

CREATE TABLE IF NOT EXISTS incidents (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  severity TEXT NOT NULL DEFAULT 'P3',
  status TEXT NOT NULL DEFAULT 'created',
  assigned_to TEXT,
  created_by TEXT NOT NULL DEFAULT 'admin',
  source_type TEXT,
  source_id TEXT,
  sla_deadline TIMESTAMPTZ,
  sla_breached BOOLEAN DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity);
CREATE INDEX IF NOT EXISTS idx_incidents_sla ON incidents(sla_deadline)
  WHERE sla_breached = FALSE AND status NOT IN ('resolved', 'closed');
CREATE INDEX IF NOT EXISTS idx_incidents_tenant_status ON incidents(tenant_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS incident_updates (
  id SERIAL PRIMARY KEY,
  incident_id INTEGER NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  update_type TEXT NOT NULL DEFAULT 'comment',
  content TEXT,
  author TEXT NOT NULL DEFAULT 'admin',
  previous_value TEXT,
  new_value TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incident_updates_incident ON incident_updates(incident_id, created_at);
