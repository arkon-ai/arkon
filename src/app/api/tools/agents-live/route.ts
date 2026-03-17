import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseJsonRecord, parseInteger, unauthorized, validateAdmin } from "../_utils";
import { registerRun } from "@/lib/active-runs";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const status = req.nextUrl.searchParams.get("status");
    const limit = Math.min(parseInteger(req.nextUrl.searchParams.get("limit"), 50), 200);
    const values: unknown[] = [];
    const filters: string[] = [];

    if (status && status !== "all") {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }

    values.push(limit);

    const result = await query(
      `SELECT *
       FROM subagent_runs
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY
         CASE status WHEN 'running' THEN 0 WHEN 'failed' THEN 1 WHEN 'completed' THEN 2 WHEN 'killed' THEN 3 ELSE 4 END,
         started_at DESC
       LIMIT $${values.length}`,
      values
    );

    return NextResponse.json({
      items: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[tools/agents-live] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();

    if (!body.agent_id || !body.run_label || !body.model) {
      return NextResponse.json(
        { error: "agent_id, run_label, and model are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO subagent_runs (
        agent_id, run_label, model, task_summary, status, started_at, completed_at,
        last_output, output_path, output_size_bytes, token_count, error_message, metadata, session_id
      )
      VALUES ($1, $2, $3, $4, COALESCE($5, 'running'), COALESCE($6, NOW()), $7,
              $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        body.agent_id,
        body.run_label,
        body.model,
        body.task_summary ?? null,
        body.status ?? "running",
        body.started_at ? new Date(body.started_at) : null,
        body.completed_at ? new Date(body.completed_at) : null,
        body.last_output ?? null,
        body.output_path ?? null,
        body.output_size_bytes ?? null,
        body.token_count ?? null,
        body.error_message ?? null,
        JSON.stringify(parseJsonRecord(body.metadata)),
        body.session_id ?? null,
      ]
    );

    // Register in active runs store if status is running
    const row = result.rows[0] as Record<string, unknown>;
    if ((row.status ?? "running") === "running") {
      // Look up agent name
      const agentRow = await query("SELECT name FROM agents WHERE id = $1 LIMIT 1", [body.agent_id]);
      const agentName = (agentRow.rows[0] as Record<string, string>)?.name ?? body.run_label;

      registerRun({
        run_id: String(row.id),
        agent_id: body.agent_id,
        agent_name: agentName,
        started_at: String(row.started_at),
        current_action: body.task_summary ?? body.run_label,
        source_channel: body.session_id ?? null,
        model: body.model,
        status: "running",
      });
    }

    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    console.error("[tools/agents-live] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
