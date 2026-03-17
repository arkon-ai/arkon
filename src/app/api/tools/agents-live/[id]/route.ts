import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseJsonRecord, unauthorized, validateAdmin } from "../../_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = await req.json();
    const status = body.status ?? null;
    const completedAt =
      status && status !== "running" ? new Date(body.completed_at ?? Date.now()) : null;

    const result = await query(
      `UPDATE subagent_runs
       SET run_label = COALESCE($2, run_label),
           model = COALESCE($3, model),
           task_summary = COALESCE($4, task_summary),
           status = COALESCE($5, status),
           completed_at = CASE
             WHEN $5 = 'running' THEN NULL
             ELSE COALESCE($6, completed_at)
           END,
           last_output = COALESCE($7, last_output),
           output_path = COALESCE($8, output_path),
           output_size_bytes = COALESCE($9, output_size_bytes),
           token_count = COALESCE($10, token_count),
           error_message = COALESCE($11, error_message),
           metadata = COALESCE($12, metadata),
           session_id = COALESCE($13, session_id)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.run_label ?? null,
        body.model ?? null,
        body.task_summary ?? null,
        status,
        completedAt,
        body.last_output ?? null,
        body.output_path ?? null,
        body.output_size_bytes ?? null,
        body.token_count ?? null,
        body.error_message ?? null,
        body.metadata ? JSON.stringify(parseJsonRecord(body.metadata)) : null,
        body.session_id ?? null,
      ]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/agents-live/:id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
