-- Migration 019: agent_identities refresh for live 4-agent fleet
-- Purpose:
--   - Align models, home_servers, and descriptions with the canonical agent charters
--     (warden-memory/agents/*/IDENTITY.md as of 2026-04-17/2026-04-21).
--   - Add `harness` column separating the runtime framework (agent-sdk | openclaw | hermes)
--     from the LLM in the `model` column.
--   - Deactivate unspawned agents (hermes, scout, opus-desktop) while preserving the rows
--     for history and future reactivation.
-- Scope: transformate tenant only. Idempotent (UPSERT + UPDATE). Re-runnable.
-- Non-goals:
--   - Does NOT touch the operational `agents` table (token-auth onboarding surface).
--   - Does NOT create or modify any DB roles, RLS policies, or secrets. Those live as
--     separate psql-run statements gated by Double-T (per plan v2 §2.1 / §2.3).
--   - Does NOT backfill or modify `brynn` (human operator row).

BEGIN;

-- ============================================================
-- 1. Add `harness` column (runtime framework)
-- ============================================================
ALTER TABLE agent_identities
  ADD COLUMN IF NOT EXISTS harness TEXT
  CHECK (harness IS NULL OR harness IN ('agent-sdk', 'openclaw', 'hermes'));

COMMENT ON COLUMN agent_identities.harness IS
  'Runtime framework hosting this agent (agent-sdk | openclaw | hermes). NULL for the human operator (brynn) and for deactivated / not-yet-spawned agents.';

-- ============================================================
-- 2. Refresh the 4 live agents — UPSERT by slug
-- ============================================================
INSERT INTO agent_identities
  (slug,        tenant_id,      display_name, role,        emoji, model,               home_server,     description,                                                                            harness,      active)
VALUES
  ('warden',    'transformate', 'Warden',     'governor',  '🛡️',  'claude-opus-4-7',    'HOFMI-TEAM-1',  'Governing agent — architecture, code, ops, orchestration across the fleet',           'agent-sdk',  TRUE),
  ('codesmith', 'transformate', 'Codesmith',  'agent',     '⚒️',  'claude-sonnet-4-6',  'HOFMI-TEAM-1',  'Focused code work — Agent SDK subagent inside warden-chat-bridge',                     'agent-sdk',  TRUE),
  ('lumina',    'transformate', 'Lumina',     'agent',     '🦊',  'gpt-5.4',            'HOFMI-EU-OPEN', 'Personal + customer-facing assistant on OpenClaw (WhatsApp, Telegram, Discord, Slack)', 'openclaw',   TRUE),
  ('sentinel',  'transformate', 'Sentinel',   'agent',     '🔒',  'gpt-5.4-codex',      'HOFMI-EU-OPEN', 'Security review + ecosystem-watch + ops (Hermes runtime)',                             'hermes',     TRUE)
ON CONFLICT (slug) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  emoji        = EXCLUDED.emoji,
  model        = EXCLUDED.model,
  home_server  = EXCLUDED.home_server,
  description  = EXCLUDED.description,
  harness      = EXCLUDED.harness,
  active       = EXCLUDED.active,
  updated_at   = NOW();

-- ============================================================
-- 3. Deactivate unspawned agents (preserve rows for history)
-- ============================================================
UPDATE agent_identities
   SET active = FALSE,
       updated_at = NOW()
 WHERE slug IN ('hermes', 'scout', 'opus-desktop')
   AND active = TRUE;  -- idempotent

-- ============================================================
-- 4. Supporting index for fleet queries (active + harness partial)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_agent_identities_active_harness
  ON agent_identities(harness)
  WHERE active = TRUE;

-- ============================================================
-- 5. Verification queries (run after apply; not part of migration)
-- ============================================================
-- SELECT slug, role, model, home_server, harness, active
--   FROM agent_identities ORDER BY active DESC, slug;
--
-- Expected:
--   active = TRUE:  warden, codesmith, lumina, sentinel, brynn
--   active = FALSE: hermes, opus-desktop, scout

COMMIT;
