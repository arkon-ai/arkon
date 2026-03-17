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
      status === "done" ? new Date() : status && status !== "done" ? null : undefined;

    const result = await query(
      `UPDATE tasks
       SET title = COALESCE($2, title),
           description = COALESCE($3, description),
           status = COALESCE($4, status),
           priority = COALESCE($5, priority),
           assignee = COALESCE($6, assignee),
           category = COALESCE($7, category),
           due_date = COALESCE($8, due_date),
           completed_at = CASE
             WHEN $9::timestamptz IS NULL AND $4 IS NOT NULL AND $4 <> 'done' THEN NULL
             ELSE COALESCE($9::timestamptz, completed_at)
           END,
           sort_order = COALESCE($10, sort_order),
           metadata = COALESCE($11, metadata),
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.title ?? null,
        body.description ?? null,
        status,
        body.priority ?? null,
        body.assignee ?? null,
        body.category ?? null,
        body.due_date ?? null,
        completedAt ?? null,
        body.sort_order ?? null,
        body.metadata ? JSON.stringify(parseJsonRecord(body.metadata)) : null,
      ]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/tasks/:id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM tasks WHERE id = $1 RETURNING id", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error("[tools/tasks/:id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
