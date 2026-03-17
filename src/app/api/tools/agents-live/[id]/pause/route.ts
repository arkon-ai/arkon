import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../../../_utils";
import { pauseRun } from "@/lib/active-runs";
import { broadcast } from "@/lib/event-bus";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;

    const result = await query(
      `UPDATE subagent_runs
       SET status = 'paused'
       WHERE id = $1 AND status = 'running'
       RETURNING *`,
      [id]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Run not found or not running" }, { status: 404 });
    }

    const row = result.rows[0] as Record<string, unknown>;
    const activeRun = pauseRun(id);

    // Log to audit trail
    const agentRow = await query("SELECT tenant_id FROM agents WHERE id = $1 LIMIT 1", [row.agent_id]);
    const tenantId = (agentRow.rows[0] as Record<string, string>)?.tenant_id ?? "default";

    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        "agent.pause",
        "agent",
        String(row.agent_id),
        JSON.stringify({ run_id: id, agent_name: activeRun?.agent_name ?? row.agent_id }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );

    broadcast({
      type: "agent_paused",
      payload: { run_id: id, agent_id: String(row.agent_id) },
    });

    return NextResponse.json({ ok: true, item: row });
  } catch (error) {
    console.error("[tools/agents-live/:id/pause] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
