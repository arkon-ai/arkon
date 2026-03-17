-- Migration 000: Base schema — all core tables for a fresh Arkon install
-- This must run BEFORE all other migrations.

-- ═══════════════════════════════════════════════════════════════════════
-- Enable extensions
-- ═══════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- ═══════════════════════════════════════════════════════════════════════
-- Core: agents, events, sessions, daily_stats
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  framework TEXT,
  token_hash TEXT,
  role TEXT DEFAULT 'operator',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  direction TEXT,
  session_key TEXT,
  channel_id TEXT,
  sender TEXT,
  content TEXT,
  metadata JSONB,
  token_estimate NUMERIC,
  threat_level TEXT DEFAULT 'none',
  threat_classes JSONB,
  threat_matches JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_created ON events(created_at DESC);

CREATE TABLE IF NOT EXISTS sessions (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  session_key TEXT,
  channel_id TEXT,
  last_active TIMESTAMPTZ,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, session_key)
);

CREATE TABLE IF NOT EXISTS daily_stats (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  messages_received INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  tool_calls INTEGER DEFAULT 0,
  errors INTEGER DEFAULT 0,
  estimated_tokens NUMERIC DEFAULT 0,
  estimated_cost_usd NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE(agent_id, day)
);

-- ═══════════════════════════════════════════════════════════════════════
-- Anomaly detection
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_baselines (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  computed_at TIMESTAMPTZ,
  avg_hourly_events NUMERIC,
  period_days INTEGER DEFAULT 7,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS anomaly_alerts (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  anomaly_type TEXT NOT NULL,
  level TEXT DEFAULT 'medium',
  current_rate NUMERIC,
  baseline_rate NUMERIC,
  multiplier NUMERIC,
  acknowledged BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Approvals
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS approvals (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT,
  content_type TEXT DEFAULT 'text',
  target_channel TEXT,
  target_destination TEXT,
  metadata JSONB,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'normal',
  reviewer_note TEXT,
  reviewed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Workflows
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS workflows (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  definition JSONB DEFAULT '{"nodes":[],"edges":[]}',
  status TEXT DEFAULT 'draft',
  trigger_type TEXT DEFAULT 'manual',
  trigger_config JSONB DEFAULT '{}',
  created_by TEXT,
  tenant_id TEXT DEFAULT 'default',
  last_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id SERIAL PRIMARY KEY,
  workflow_id INTEGER REFERENCES workflows(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'running',
  triggered_by TEXT DEFAULT 'manual',
  tenant_id TEXT DEFAULT 'default',
  step_results JSONB DEFAULT '[]',
  error TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Cron jobs (synced from OpenClaw/NemoClaw gateway)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cron_jobs (
  id TEXT PRIMARY KEY,
  name TEXT,
  enabled BOOLEAN DEFAULT true,
  schedule_kind TEXT,
  schedule_expr TEXT,
  schedule_tz TEXT,
  session_target TEXT,
  payload_kind TEXT,
  payload_message TEXT,
  payload_model TEXT,
  delivery_mode TEXT,
  next_run_at TIMESTAMPTZ,
  last_run_at TIMESTAMPTZ,
  last_status TEXT,
  last_error TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  raw JSONB,
  synced_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════
-- Tasks & execution
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS tasks (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'todo',
  priority TEXT DEFAULT 'P3',
  assignee TEXT DEFAULT 'agent',
  category TEXT,
  due_date DATE,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS tool_calls (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  input JSONB,
  output JSONB,
  status TEXT DEFAULT 'completed',
  duration_ms INTEGER,
  session_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subagent_runs (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  run_label TEXT,
  model TEXT,
  task_summary TEXT,
  status TEXT DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_output TEXT,
  output_path TEXT,
  output_size_bytes BIGINT,
  token_count INTEGER,
  error_message TEXT,
  metadata JSONB,
  session_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Budget tracking
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS budget_limits (
  id SERIAL PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  daily_limit_usd NUMERIC,
  monthly_limit_usd NUMERIC,
  alert_threshold_pct INTEGER DEFAULT 80,
  action_on_exceed TEXT DEFAULT 'alert',
  tenant_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════
-- Documents & calendar
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT,
  category TEXT,
  content TEXT,
  content_format TEXT DEFAULT 'markdown',
  file_path TEXT,
  tags TEXT[],
  pinned BOOLEAN DEFAULT false,
  metadata JSONB,
  word_count INTEGER,
  search_vector tsvector,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING gin(search_vector);

CREATE TABLE IF NOT EXISTS calendar_items (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  title TEXT,
  description TEXT,
  item_type TEXT DEFAULT 'event',
  scheduled_at TIMESTAMPTZ,
  duration_minutes INTEGER,
  status TEXT DEFAULT 'scheduled',
  target_channel TEXT,
  linked_approval_id INTEGER REFERENCES approvals(id),
  linked_task_id INTEGER REFERENCES tasks(id),
  color TEXT,
  recurring TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- ═══════════════════════════════════════════════════════════════════════
-- Client intake
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS intake_submissions (
  id SERIAL PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  client_label TEXT,
  payload JSONB,
  processed BOOLEAN DEFAULT false,
  notes TEXT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- MCP Gateway
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS mcp_servers (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT,
  host TEXT,
  port INTEGER,
  server_type TEXT DEFAULT 'mcp',
  config_json JSONB,
  approved BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'unknown',
  last_checked TIMESTAMPTZ,
  gateway_enabled BOOLEAN DEFAULT false,
  gateway_token TEXT,
  tenant_id TEXT DEFAULT 'default',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_server_agents (
  id SERIAL PRIMARY KEY,
  mcp_server_id INTEGER REFERENCES mcp_servers(id) ON DELETE CASCADE,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  granted_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mcp_proxy_logs (
  id SERIAL PRIMARY KEY,
  server_id INTEGER,
  server_name TEXT,
  agent_id TEXT,
  method TEXT,
  mcp_method TEXT,
  request_size INTEGER,
  response_size INTEGER,
  status INTEGER,
  duration_ms INTEGER,
  error TEXT,
  tenant_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ═══════════════════════════════════════════════════════════════════════
-- Audit log
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id SERIAL PRIMARY KEY,
  actor TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  detail JSONB,
  ip_address TEXT,
  tenant_id TEXT DEFAULT 'default',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════
-- Benchmarks & model pricing
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS benchmark_runs (
  id SERIAL PRIMARY KEY,
  model_id TEXT,
  model_provider TEXT DEFAULT 'unknown',
  prompt_hash TEXT,
  prompt_label TEXT,
  latency_ms INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER,
  cost_usd NUMERIC,
  quality_score NUMERIC,
  agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
  tenant_id TEXT DEFAULT 'default',
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_pricing (
  id SERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  display_name TEXT,
  cost_per_1k_input NUMERIC,
  cost_per_1k_output NUMERIC,
  is_free BOOLEAN DEFAULT false,
  effective_from DATE DEFAULT CURRENT_DATE,
  effective_until DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider, model_id, effective_from)
);

-- ═══════════════════════════════════════════════════════════════════════
-- Infrastructure monitoring
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS infra_nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ip TEXT,
  role TEXT DEFAULT 'primary',
  os TEXT,
  ssh_user TEXT,
  tenant_id TEXT DEFAULT 'default',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS node_metrics (
  id SERIAL,
  time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  node_id TEXT REFERENCES infra_nodes(id) ON DELETE CASCADE,
  cpu_percent NUMERIC,
  memory_used_mb INTEGER,
  memory_total_mb INTEGER,
  disk_used_gb INTEGER,
  disk_total_gb INTEGER,
  docker_running INTEGER,
  gpu_util_percent INTEGER,
  services JSONB,
  tailscale_latency_ms INTEGER,
  status TEXT DEFAULT 'online',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert node_metrics to TimescaleDB hypertable
SELECT create_hypertable('node_metrics', 'time', if_not_exists => TRUE);

-- ═══════════════════════════════════════════════════════════════════════
-- Quick commands
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quick_commands (
  id SERIAL PRIMARY KEY,
  agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
  command TEXT NOT NULL,
  response TEXT,
  status TEXT DEFAULT 'sent',
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
