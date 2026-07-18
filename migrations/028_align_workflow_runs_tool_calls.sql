-- WI-1848 (2026-07-18): 000 is CREATE TABLE IF NOT EXISTS, so its prod-parity
-- reshape (workflow_runs.started_at, tool_calls result_summary shape) only
-- lands on from-scratch DBs. This aligner repairs databases initialized from
-- the pre-WI-1848 000 (dev locals, persisted volumes). No-op on prod (already
-- the target shape) and on fresh DBs (000 now creates the target shape).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'workflow_runs' AND column_name = 'created_at')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'workflow_runs' AND column_name = 'started_at') THEN
    ALTER TABLE workflow_runs RENAME COLUMN created_at TO started_at;
  END IF;
END;
$$;

-- Additive convergence only: legacy input/output/status/session_key columns
-- (old-000 DBs) are left in place — nothing reads them.
ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS event_id BIGINT;
ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS arguments_summary TEXT;
ALTER TABLE tool_calls ADD COLUMN IF NOT EXISTS result_summary TEXT;

CREATE INDEX IF NOT EXISTS idx_tool_calls_agent ON tool_calls(agent_id, created_at DESC);

-- Old-000 DBs carry ON DELETE CASCADE on tool_calls.agent_id; prod and the
-- corrected 000 use plain NO ACTION (purge routes delete explicitly). Converge
-- delete semantics: swap only when the existing FK cascades (no-op on prod/fresh).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint
             WHERE conname = 'tool_calls_agent_id_fkey'
               AND conrelid = 'public.tool_calls'::regclass
               AND confdeltype = 'c') THEN
    ALTER TABLE tool_calls DROP CONSTRAINT tool_calls_agent_id_fkey;
    ALTER TABLE tool_calls ADD CONSTRAINT tool_calls_agent_id_fkey
      FOREIGN KEY (agent_id) REFERENCES agents(id);
  END IF;
END;
$$;
