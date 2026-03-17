-- Migration 003: Setup wizard — track first-run completion
-- Adds setup_completed flag and org_name to tenants

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS admin_email TEXT;

-- Mark existing tenants as setup-complete (they predate the wizard)
UPDATE tenants SET setup_completed = TRUE WHERE setup_completed = FALSE;
