import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "../../_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("SELECT * FROM quick_commands WHERE id = $1", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/commands/:id] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = await req.json();
    const status = body.status ?? null;
    const respondedAt =
      status === "completed" || typeof body.response === "string"
        ? new Date(body.responded_at ?? Date.now())
        : null;

    const result = await query(
      `UPDATE quick_commands
       SET command = COALESCE($2, command),
           response = COALESCE($3, response),
           status = COALESCE($4, status),
           responded_at = CASE
             WHEN $5::timestamptz IS NULL AND $4 = 'error' THEN responded_at
             ELSE COALESCE($5::timestamptz, responded_at)
           END
       WHERE id = $1
       RETURNING *`,
      [id, body.command ?? null, body.response ?? null, status, respondedAt]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/commands/:id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM quick_commands WHERE id = $1 RETURNING id", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Command not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error("[tools/commands/:id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
