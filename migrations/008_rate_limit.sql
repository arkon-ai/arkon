-- Migration 008: Persistent rate limiting via TimescaleDB
-- Replaces in-memory Map that resets on PM2 restart

CREATE TABLE rate_limit_windows (
  key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  count INTEGER DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

SELECT create_hypertable('rate_limit_windows', 'window_start');

-- Auto-cleanup: drop windows older than 1 hour
SELECT add_retention_policy('rate_limit_windows', INTERVAL '1 hour');
