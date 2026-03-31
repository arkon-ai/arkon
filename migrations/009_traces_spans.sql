-- Migration 009: Traces & Spans (Phase 4 Observability)
-- TimescaleDB hypertables with 90-day retention

CREATE TABLE traces (
  id BIGSERIAL,
  trace_id UUID NOT NULL DEFAULT gen_random_uuid(),
  agent_id TEXT,
  tenant_id TEXT,
  name TEXT,
  status TEXT DEFAULT 'ok',
  duration_ms INTEGER,
  token_count INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'
);
SELECT create_hypertable('traces', 'started_at');
CREATE INDEX idx_traces_trace_id ON traces(trace_id);
CREATE INDEX idx_traces_agent_id ON traces(agent_id, started_at DESC);
CREATE INDEX idx_traces_status ON traces(status, started_at DESC);

CREATE TABLE spans (
  id BIGSERIAL,
  trace_id UUID NOT NULL,
  span_id UUID NOT NULL DEFAULT gen_random_uuid(),
  parent_span_id UUID,
  name TEXT,
  type TEXT NOT NULL DEFAULT 'chain',
  status TEXT DEFAULT 'ok',
  duration_ms INTEGER,
  token_count INTEGER DEFAULT 0,
  cost NUMERIC(10,6) DEFAULT 0,
  input JSONB,
  output JSONB,
  metadata JSONB DEFAULT '{}',
  error TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);
SELECT create_hypertable('spans', 'started_at');
CREATE INDEX idx_spans_trace_id ON spans(trace_id, started_at);
CREATE INDEX idx_spans_parent ON spans(parent_span_id);
CREATE INDEX idx_spans_type ON spans(type, started_at DESC);

-- 90-day retention policies
SELECT add_retention_policy('traces', INTERVAL '90 days');
SELECT add_retention_policy('spans', INTERVAL '90 days');
