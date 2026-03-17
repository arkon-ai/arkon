import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../../../_utils";
import { removeRun, getRunById } from "@/lib/active-runs";
import { broadcast } from "@/lib/event-bus";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as { reason?: string };

    // Snapshot active run before removing
    const activeRun = getRunById(id);

    const result = await query(
      `UPDATE subagent_runs
       SET status = 'killed',
           completed_at = NOW(),
           error_message = $2
       WHERE id = $1
       RETURNING *`,
      [id, body.reason ? `Killed: ${body.reason}` : "Killed from Arkon"]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const row = result.rows[0] as Record<string, unknown>;

    // Remove from active runs store
    removeRun(id);

    // Calculate run duration
    const startedAt = row.started_at ? new Date(String(row.started_at)) : null;
    const completedAt = row.completed_at ? new Date(String(row.completed_at)) : new Date();
    const durationMs = startedAt ? completedAt.getTime() - startedAt.getTime() : 0;

    // Log to audit trail
    const agentRow = await query("SELECT name, tenant_id FROM agents WHERE id = $1 LIMIT 1", [row.agent_id]);
    const agent = agentRow.rows[0] as Record<string, string> | undefined;
    const tenantId = agent?.tenant_id ?? "default";

    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        "agent.kill",
        "agent",
        String(row.agent_id),
        JSON.stringify({
          run_id: id,
          agent_name: activeRun?.agent_name ?? agent?.name ?? row.agent_id,
          run_duration_ms: durationMs,
          action_interrupted: activeRun?.current_action ?? row.task_summary ?? null,
          reason: body.reason ?? null,
          source_channel: activeRun?.source_channel ?? null,
          model: activeRun?.model ?? row.model ?? null,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );

    // Broadcast kill event to connected dashboards
    broadcast({
      type: "agent_killed",
      payload: {
        run_id: id,
        agent_id: String(row.agent_id),
        agent_name: activeRun?.agent_name ?? agent?.name ?? String(row.agent_id),
        duration_ms: durationMs,
        reason: body.reason ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      item: row,
      stopped: {
        agent_name: activeRun?.agent_name ?? agent?.name ?? row.agent_id,
        action_interrupted: activeRun?.current_action ?? row.task_summary ?? null,
        duration_ms: durationMs,
        reason: body.reason ?? null,
      },
    });
  } catch (error) {
    console.error("[tools/agents-live/:id/kill] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
