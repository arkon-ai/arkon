// In-memory store of currently running agent sessions.
// Populated from subagent_runs table on startup, kept in sync via ingest + kill endpoints.

export interface ActiveRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
  started_at: string;
  current_action: string;
  source_channel: string | null;
  model: string | null;
  status: "running" | "paused";
}

const runs = new Map<string, ActiveRun>();

export function registerRun(run: ActiveRun): void {
  runs.set(run.run_id, run);
}

export function updateRunAction(runId: string, action: string): void {
  const run = runs.get(runId);
  if (run) run.current_action = action;
}

export function pauseRun(runId: string): ActiveRun | null {
  const run = runs.get(runId);
  if (!run) return null;
  run.status = "paused";
  return run;
}

export function resumeRun(runId: string): ActiveRun | null {
  const run = runs.get(runId);
  if (!run) return null;
  run.status = "running";
  return run;
}

export function removeRun(runId: string): ActiveRun | null {
  const run = runs.get(runId);
  if (!run) return null;
  runs.delete(runId);
  return run;
}

export function getRuns(): ActiveRun[] {
  return Array.from(runs.values());
}

export function getRunsByAgent(agentId: string): ActiveRun[] {
  return Array.from(runs.values()).filter((r) => r.agent_id === agentId);
}

export function getRunById(runId: string): ActiveRun | null {
  return runs.get(runId) ?? null;
}

export function getRunCount(): number {
  return runs.size;
}

/**
 * Hydrate active runs from subagent_runs table on server start.
 * Call this once during app initialization.
 */
export async function hydrateFromDb(
  queryFn: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>
): Promise<void> {
  try {
    const result = await queryFn(
      `SELECT r.id, r.agent_id, r.model, r.task_summary, r.started_at, r.status, r.session_id,
              a.name as agent_name
       FROM subagent_runs r
       LEFT JOIN agents a ON a.id = r.agent_id
       WHERE r.status IN ('running', 'paused')
       ORDER BY r.started_at DESC`
    );

    for (const row of result.rows) {
      registerRun({
        run_id: String(row.id),
        agent_id: String(row.agent_id ?? ""),
        agent_name: String(row.agent_name ?? row.agent_id ?? "Unknown"),
        started_at: String(row.started_at ?? new Date().toISOString()),
        current_action: String(row.task_summary ?? "Running"),
        source_channel: row.session_id ? String(row.session_id) : null,
        model: row.model ? String(row.model) : null,
        status: row.status === "paused" ? "paused" : "running",
      });
    }

    console.log(`[active-runs] Hydrated ${result.rows.length} active runs from DB`);
  } catch (err) {
    console.error("[active-runs] Failed to hydrate from DB:", err);
  }
}
