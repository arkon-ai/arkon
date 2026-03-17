import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseJsonRecord, unauthorized, validateAdmin } from "../_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const start = req.nextUrl.searchParams.get("start");
    const end = req.nextUrl.searchParams.get("end");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (start) {
      values.push(new Date(start));
      filters.push(`scheduled_at >= $${values.length}`);
    }

    if (end) {
      values.push(new Date(end));
      filters.push(`scheduled_at <= $${values.length}`);
    }

    const result = await query(
      `SELECT *
       FROM calendar_items
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY scheduled_at ASC`,
      values
    );

    return NextResponse.json({
      items: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[tools/calendar] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();

    if (!body.title || !body.item_type || !body.scheduled_at) {
      return NextResponse.json(
        { error: "title, item_type, and scheduled_at are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO calendar_items (
        agent_id, title, description, item_type, scheduled_at, duration_minutes, status,
        target_channel, linked_approval_id, linked_task_id, color, recurring, metadata
      )
      VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7, 'scheduled'),
              $8, $9, $10, $11, $12, $13)
      RETURNING *`,
      [
        body.agent_id ?? null,
        body.title,
        body.description ?? null,
        body.item_type,
        new Date(body.scheduled_at),
        body.duration_minutes ?? null,
        body.status ?? "scheduled",
        body.target_channel ?? null,
        body.linked_approval_id ?? null,
        body.linked_task_id ?? null,
        body.color ?? null,
        body.recurring ?? null,
        JSON.stringify(parseJsonRecord(body.metadata)),
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("[tools/calendar] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
