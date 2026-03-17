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

    if (!status) {
      return NextResponse.json({ error: "status is required" }, { status: 400 });
    }

    const reviewedAt = ["approved", "rejected", "sent", "expired"].includes(status) ? new Date() : null;
    const sentAt = status === "sent" ? new Date() : null;

    const result = await query(
      `UPDATE approvals
       SET title = COALESCE($2, title),
           content = COALESCE($3, content),
           content_type = COALESCE($4, content_type),
           target_channel = COALESCE($5, target_channel),
           target_destination = COALESCE($6, target_destination),
           metadata = COALESCE($7, metadata),
           status = $8,
           priority = COALESCE($9, priority),
           reviewer_note = COALESCE($10, reviewer_note),
           reviewed_at = COALESCE($11, reviewed_at),
           sent_at = COALESCE($12, sent_at),
           expires_at = COALESCE($13, expires_at)
       WHERE id = $1
       RETURNING *`,
      [
        id,
        body.title ?? null,
        body.content ?? null,
        body.content_type ?? null,
        body.target_channel ?? null,
        body.target_destination ?? null,
        body.metadata ? JSON.stringify(parseJsonRecord(body.metadata)) : null,
        status,
        body.priority ?? null,
        body.reviewer_note ?? null,
        reviewedAt,
        sentAt,
        body.expires_at ? new Date(body.expires_at) : null,
      ]
    );

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    return NextResponse.json(result.rows[0]);
  } catch (error) {
    console.error("[tools/approvals/:id] PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const result = await query("DELETE FROM approvals WHERE id = $1 RETURNING id", [id]);

    if (!result.rows[0]) {
      return NextResponse.json({ error: "Approval not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id: result.rows[0].id });
  } catch (error) {
    console.error("[tools/approvals/:id] DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
