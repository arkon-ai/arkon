import { NextRequest, NextResponse } from "next/server";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { getRuns, getRunsByAgent } from "@/lib/active-runs";
import { query } from "@/lib/db";

/** Threshold for considering an agent "live" (5 minutes) */
const LIVE_THRESHOLD_MS = 5 * 60 * 1000;

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const agentId = req.nextUrl.searchParams.get("agent_id");

  // 1. Sub-agent runs from in-memory store (existing behavior)
  const subRuns = agentId ? getRunsByAgent(agentId) : getRuns();

  // 2. Live main agents from agents table (last event within threshold)
  let liveAgents: Array<{
    run_id: string;
    agent_id: string;
    agent_name: string;
    started_at: string;
    current_action: string;
    source_channel: string | null;
    model: string | null;
    status: "running" | "paused";
    is_main_agent: boolean;
  }> = [];

  try {
    const cutoff = new Date(Date.now() - LIVE_THRESHOLD_MS).toISOString();
    const agentFilter = agentId ? "AND a.id = $2" : "";
    const params: unknown[] = [cutoff];
    if (agentId) params.push(agentId);

    const result = await query(
      `SELECT a.id, a.name, a.metadata, a.tenant_id,
              (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) as last_active,
              (SELECT e.content FROM events e WHERE e.agent_id = a.id ORDER BY e.created_at DESC LIMIT 1) as last_event
       FROM agents a
       WHERE (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) > $1
       ${agentFilter}
       ORDER BY last_active DESC`,
      params
    );

    // Filter out agents that already have sub-agent runs (avoid duplicates)
    const subRunAgentIds = new Set(subRuns.map((r) => r.agent_id));

    liveAgents = result.rows
      .filter((row: Record<string, unknown>) => !subRunAgentIds.has(String(row.id)))
      .map((row: Record<string, unknown>) => {
        const meta = (row.metadata ?? {}) as Record<string, string>;
        const lastEvent = row.last_event ? String(row.last_event).slice(0, 80) : "Processing";
        return {
          run_id: `agent:${row.id}`,
          agent_id: String(row.id),
          agent_name: String(row.name ?? row.id),
          started_at: String(row.last_active),
          current_action: lastEvent,
          source_channel: null,
          model: meta.instance ?? null,
          status: "running" as const,
          is_main_agent: true,
        };
      });
  } catch (err) {
    console.error("[active-runs] Failed to query live agents:", err);
  }

  // Tag sub-agent runs
  const taggedSubRuns = subRuns.map((r) => ({ ...r, is_main_agent: false }));

  const allRuns = [...taggedSubRuns, ...liveAgents];

  return NextResponse.json({
    runs: allRuns,
    count: allRuns.length,
    timestamp: new Date().toISOString(),
  });
}
