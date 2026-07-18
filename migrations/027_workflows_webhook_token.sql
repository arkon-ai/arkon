-- WI-1848 (2026-07-18): /api/workflows/scheduler and
-- /api/workflows/webhook/[token] both query workflows.webhook_token, but no
-- migration ever created the column — scheduler 500s on a from-scratch DB.
-- The token is a bearer credential (webhook route resolves a workflow by it),
-- so uniqueness is an integrity constraint, not an optimization — enforce it
-- before any writer exists (panel finding, 3-lane convergent).

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS webhook_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflows_webhook_token
  ON workflows(webhook_token) WHERE webhook_token IS NOT NULL;
