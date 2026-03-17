-- Migration 004: Notifications & alert system
-- In-app notification center + notification preferences for multi-channel dispatch

-- 1. Notifications table — stores all in-app notifications
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL DEFAULT 'default' REFERENCES tenants(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- threat, anomaly, approval, budget, agent_offline, infra_offline, intake, workflow_failure
  severity TEXT NOT NULL DEFAULT 'info',  -- info, warning, critical
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,  -- relative URL to navigate to on click
  metadata JSONB DEFAULT '{}',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_tenant_read ON notifications(tenant_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_created ON notifications(tenant_id, created_at DESC);

-- 2. Notification preferences — per-tenant channel configuration
CREATE TABLE IF NOT EXISTS notification_preferences (
  id SERIAL PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,  -- email, slack, telegram, discord, webhook
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  config JSONB NOT NULL DEFAULT '{}',  -- channel-specific config (webhook_url, bot_token, chat_id, email, etc.)
  -- Per-type toggles stored in config: { "types": { "threat_critical": true, "threat_high": true, ... } }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_prefs_tenant ON notification_preferences(tenant_id);
