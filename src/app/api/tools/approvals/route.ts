import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseJsonRecord, parseInteger, unauthorized, validateAdmin } from "../_utils";
import { fireApprovalAlert } from "@/lib/alert-fire";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const status = req.nextUrl.searchParams.get("status");
    const limit = Math.min(parseInteger(req.nextUrl.searchParams.get("limit"), 50), 200);

    // Auto-expire pending approvals past their expires_at
    await query(
      `UPDATE approvals SET status = 'expired', reviewed_at = NOW()
       WHERE status = 'pending' AND expires_at IS NOT NULL AND expires_at < NOW()`
    );

    const filters: string[] = [];
    const values: unknown[] = [];

    if (status && status !== "all") {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }

    values.push(limit);

    const result = await query(
      `SELECT a.*, ag.name as agent_name
       FROM approvals a
       LEFT JOIN agents ag ON ag.id = a.agent_id
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY
         CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'rejected' THEN 2 WHEN 'expired' THEN 3 ELSE 4 END,
         a.created_at DESC
       LIMIT $${values.length}`,
      values
    );

    const pending = await query(
      "SELECT COUNT(*)::int AS count FROM approvals WHERE status = 'pending'"
    );

    return NextResponse.json({
      items: result.rows,
      pendingCount: pending.rows[0]?.count ?? 0,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[tools/approvals] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();

    if (!body.title || !body.content || !body.agent_id) {
      return NextResponse.json(
        { error: "agent_id, title, and content are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO approvals (
        agent_id, title, content, content_type, target_channel, target_destination,
        metadata, status, priority, reviewer_note, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, 'pending'), COALESCE($9, 'normal'), $10, $11)
      RETURNING *`,
      [
        body.agent_id,
        body.title,
        body.content,
        body.content_type ?? "text",
        body.target_channel ?? null,
        body.target_destination ?? null,
        JSON.stringify(parseJsonRecord(body.metadata)),
        body.status ?? "pending",
        body.priority ?? "normal",
        body.reviewer_note ?? null,
        body.expires_at ? new Date(body.expires_at) : null,
      ]
    );

    const approval = result.rows[0];

    // Fire Telegram notification for new pending approvals (non-blocking)
    if (!body.status || body.status === "pending") {
      void fireApprovalAlert({
        id: approval.id,
        title: approval.title,
        agentId: body.agent_id,
        priority: body.priority ?? "normal",
        channel: body.target_channel,
        contentPreview: (body.content as string).slice(0, 120),
      });
    }

    return NextResponse.json(approval, { status: 201 });
  } catch (error) {
    console.error("[tools/approvals] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
