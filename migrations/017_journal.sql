-- Migration 017: Journal — work_entries + warden_sessions + agent_identities
-- Purpose: unified work tracker for Warden + governed agents (Lumina, Sentinel, etc.)
--          plus conversation continuity for Warden-as-a-Service.
-- RBAC: every agent writes to own entries only; Warden + Brynn are governors with full access.
-- Scope: per-tenant. Safe re-run with IF NOT EXISTS guards.

-- ============================================================
-- 1. Agent identities — who can write, what their role is
-- ============================================================
CREATE TABLE IF NOT EXISTS agent_identities (
  slug TEXT PRIMARY KEY,                       -- 'warden' | 'lumina' | 'sentinel' | 'scout' | 'codesmith' | 'hermes' | 'brynn' | 'opus-desktop'
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('governor', 'agent')),
  emoji TEXT,
  model TEXT,                                  -- e.g. 'claude-opus-4-6'
  home_server TEXT,                            -- e.g. 'warden-eu', 'HOFMI-EU-OPEN', 'laptop'
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_identities_tenant ON agent_identities(tenant_id);

-- Seed the known agents for default tenant (Brynn)
INSERT INTO agent_identities (slug, tenant_id, display_name, role, emoji, model, home_server, description)
VALUES
  ('warden',       'transformate', 'Warden',       'governor', '🛡️', 'claude-opus-4-6',  'warden-eu',     'Governing agent — architecture, code, ops, orchestration'),
  ('brynn',        'transformate', 'Brynn',        'governor', '👤', NULL,               NULL,            'Human operator'),
  ('lumina',       'transformate', 'Lumina',       'agent',    '🦊', 'claude-sonnet-4-6','HOFMI-EU-OPEN', 'Personal + customer-facing assistant on OpenClaw'),
  ('sentinel',     'transformate', 'Sentinel',     'agent',    '🔒', 'gpt-5.4-codex',    'HOFMI-EU-OPEN', 'Security + research'),
  ('scout',        'transformate', 'Scout',        'agent',    '🔭', 'claude-haiku-4-5', 'warden-eu',     'Research + daily intel gathering (planned)'),
  ('codesmith',    'transformate', 'Codesmith',    'agent',    '⚒️', 'claude-opus-4-6',  'warden-eu',     'Focused code work (planned)'),
  ('hermes',       'transformate', 'Hermes',       'agent',    '⚡', 'claude-haiku-4-5', 'warden-eu',     'Ops + cron + deploy monitoring (planned)'),
  ('opus-desktop', 'transformate', 'Opus Desktop', 'agent',    '💭', 'claude-opus-4-6',  'laptop',        'Desktop Claude app thinking surface (read-only in tracker)')
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  emoji        = EXCLUDED.emoji,
  model        = EXCLUDED.model,
  home_server  = EXCLUDED.home_server,
  description  = EXCLUDED.description,
  updated_at   = NOW();

-- ============================================================
-- 2. work_entries — the tracker itself
-- ============================================================
CREATE TABLE IF NOT EXISTS work_entries (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  owner_agent TEXT NOT NULL REFERENCES agent_identities(slug),
  parent_id BIGINT REFERENCES work_entries(id) ON DELETE SET NULL,

  -- classification
  category TEXT NOT NULL CHECK (category IN ('task','log','decision','insight','question','blocker','ship','note')),
  status TEXT NOT NULL DEFAULT 'log' CHECK (status IN ('todo','in_progress','done','blocked','cancelled','log')),
  priority SMALLINT NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),

  -- content
  title TEXT NOT NULL,
  body_md TEXT,
  links JSONB NOT NULL DEFAULT '[]',           -- [{title, url}, ...]
  tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  related_project TEXT,                        -- e.g. 'mentz-and-co', 'skip-witbank', 'arkon'

  -- scheduling
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- lineage
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_key_id TEXT,                      -- refers to api_keys.id (if the write came via API key)

  -- search (maintained via trigger because to_tsvector isn't immutable enough for generated columns)
  search_vector tsvector
);

CREATE OR REPLACE FUNCTION work_entries_refresh_search() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.body_md, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.related_project, '')), 'C') ||
    setweight(to_tsvector('english', array_to_string(NEW.tags, ' ')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_entries_search ON work_entries;
CREATE TRIGGER trg_work_entries_search
  BEFORE INSERT OR UPDATE OF title, body_md, related_project, tags ON work_entries
  FOR EACH ROW EXECUTE FUNCTION work_entries_refresh_search();

CREATE INDEX IF NOT EXISTS idx_work_entries_tenant        ON work_entries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_work_entries_owner         ON work_entries(tenant_id, owner_agent);
CREATE INDEX IF NOT EXISTS idx_work_entries_status        ON work_entries(tenant_id, status) WHERE status IN ('todo','in_progress','blocked');
CREATE INDEX IF NOT EXISTS idx_work_entries_due           ON work_entries(tenant_id, due_at) WHERE due_at IS NOT NULL AND status NOT IN ('done','cancelled');
CREATE INDEX IF NOT EXISTS idx_work_entries_occurred_at   ON work_entries(tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_work_entries_parent        ON work_entries(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_entries_project       ON work_entries(tenant_id, related_project) WHERE related_project IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_work_entries_tags          ON work_entries USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_work_entries_search        ON work_entries USING gin(search_vector);

-- If TimescaleDB extension is present, make it a hypertable for time-range efficiency
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
    PERFORM create_hypertable('work_entries', 'occurred_at', if_not_exists => TRUE, migrate_data => TRUE);
  END IF;
EXCEPTION WHEN others THEN
  -- hypertable creation is optional; continue regardless
  NULL;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION work_entries_touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_entries_updated_at ON work_entries;
CREATE TRIGGER trg_work_entries_updated_at
  BEFORE UPDATE ON work_entries
  FOR EACH ROW EXECUTE FUNCTION work_entries_touch_updated_at();

-- ============================================================
-- 3. warden_sessions — conversational continuity across surfaces
-- ============================================================
CREATE TABLE IF NOT EXISTS warden_sessions (
  id TEXT PRIMARY KEY,                         -- ULID/UUID
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('arkon-chat','arkon-pwa','discord','claude-code-laptop','claude-code-warden-eu','cron')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  session_lock_owner TEXT,                     -- which surface currently holds the write-lock (prevents split-brain)
  title TEXT,                                  -- short human-readable summary
  metadata JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_warden_sessions_tenant ON warden_sessions(tenant_id, active);
CREATE INDEX IF NOT EXISTS idx_warden_sessions_recent ON warden_sessions(tenant_id, last_activity_at DESC);

CREATE TABLE IF NOT EXISTS warden_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES warden_sessions(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  author_agent TEXT NOT NULL REFERENCES agent_identities(slug),
  role TEXT NOT NULL CHECK (role IN ('user','assistant','tool','system')),
  content TEXT NOT NULL,
  tool_calls JSONB,
  tool_results JSONB,
  tokens_in INT,
  tokens_out INT,
  cost_usd NUMERIC(10,6),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_warden_messages_session ON warden_messages(session_id, created_at);

-- ============================================================
-- 4. journal_reminders — lightweight scheduler (uses Arkon workflows scheduler later)
-- ============================================================
CREATE TABLE IF NOT EXISTS journal_reminders (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entry_id BIGINT NOT NULL REFERENCES work_entries(id) ON DELETE CASCADE,
  fire_at TIMESTAMPTZ NOT NULL,
  fired_at TIMESTAMPTZ,
  channel TEXT NOT NULL DEFAULT 'discord' CHECK (channel IN ('discord','email','arkon-banner','lumina-wa')),
  cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_journal_reminders_pending
  ON journal_reminders(tenant_id, fire_at)
  WHERE fired_at IS NULL AND cancelled = FALSE;

-- ============================================================
-- 5. Helpful views
-- ============================================================
CREATE OR REPLACE VIEW journal_feed AS
SELECT
  we.id,
  we.tenant_id,
  we.owner_agent,
  ai.display_name AS owner_display_name,
  ai.emoji AS owner_emoji,
  we.parent_id,
  we.category,
  we.status,
  we.priority,
  we.title,
  we.body_md,
  we.links,
  we.tags,
  we.related_project,
  we.occurred_at,
  we.due_at,
  we.completed_at,
  we.created_at,
  we.updated_at
FROM work_entries we
JOIN agent_identities ai ON ai.slug = we.owner_agent
ORDER BY we.occurred_at DESC;

COMMENT ON TABLE work_entries IS 'Unified work tracker. Writable by owning agent (RBAC at API layer). Readable by all agents in same tenant.';
COMMENT ON TABLE warden_sessions IS 'Conversational continuity for Warden across surfaces. session_lock_owner prevents split-brain writes.';
COMMENT ON TABLE warden_messages IS 'Per-session message log. Supports cost + token tracking.';
COMMENT ON TABLE agent_identities IS 'Registry of agents that can write to the tracker. Role = governor (full access) or agent (own entries).';
