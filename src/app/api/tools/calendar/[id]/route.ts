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

    const result = await query(
      `UPDATE calendar_items
       SET agent_id = COALESCE($2, agent_id),
           title = COALESCE($3, title),
           description = COALESCE($4, description),
           item_type = COALESCE($5, item_type),
           scheduled_at = COALESCE($6, scheduled_at),
           duration_minutes = COALESCE($7, duration_minutes),
           status = COALESCE($8, status),
           target_channel = COALESCE($9, target_channel),
           linked_approval_id = COALESCE($10, linked_approval_id),
           linked_task_id = COALESCE($11, linked_task_id),
           color = COALESCE($12, color),
           recurring = COALESCE($13, recurring),
           metadata = COALESCE($14, metadata)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.agent_id ?? null,
        body.title ?? null,
        body.description ?? null,
        body.item_type ?? null,
        body.scheduled_at ? new Date(body.scheduled_at) : null,
        body.duration_minutes ?? null,
        body.status ?? null,
        body.target_channel ?? null,
        body.linked_approval_id ?? null,
        body.linked_task_id ?? null,
        body.color ?? null,
        body.recurring ?? null,
        body.metadata ? JSON.stringify(parseJsonRecord(body.metadata)) : null,
      ]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Calendar item not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/calendar/:id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM calendar_items WHERE id = $1 RETURNING id", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Calendar item not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error("[tools/calendar/:id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
