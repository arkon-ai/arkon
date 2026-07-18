-- WI-1848 (2026-07-18): /api/workflows/scheduler and
-- /api/workflows/webhook/[token] both query workflows.webhook_token, but no
-- migration ever created the column — scheduler 500s on a from-scratch DB.
-- ponytail: no index — nothing writes tokens yet and the table is tiny; add a
-- partial unique index when webhook creation ships.

ALTER TABLE workflows ADD COLUMN IF NOT EXISTS webhook_token TEXT;
