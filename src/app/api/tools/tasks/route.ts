import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseJsonRecord, unauthorized, validateAdmin } from "../_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const status = req.nextUrl.searchParams.get("status");
    const priority = req.nextUrl.searchParams.get("priority");
    const assignee = req.nextUrl.searchParams.get("assignee");

    const filters: string[] = [];
    const values: unknown[] = [];

    if (status && status !== "all") {
      values.push(status);
      filters.push(`status = $${values.length}`);
    }

    if (priority && priority !== "all") {
      values.push(priority);
      filters.push(`priority = $${values.length}`);
    }

    if (assignee && assignee !== "all") {
      values.push(assignee);
      filters.push(`assignee = $${values.length}`);
    }

    const result = await query(
      `SELECT *
       FROM tasks
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY
         CASE status WHEN 'todo' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
         sort_order ASC,
         created_at DESC`,
      values
    );

    return NextResponse.json({
      items: result.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[tools/tasks] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();

    if (!body.title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const nextOrder = await query(
      "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next_order FROM tasks WHERE status = COALESCE($1, 'todo')",
      [body.status ?? "todo"]
    );

    const result = await query(
      `INSERT INTO tasks (
        agent_id, title, description, status, priority, assignee, category, due_date,
        completed_at, sort_order, metadata
      )
      VALUES ($1, $2, $3, COALESCE($4, 'todo'), COALESCE($5, 'P3'), COALESCE($6, 'agent'),
              $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        body.agent_id ?? null,
        body.title,
        body.description ?? null,
        body.status ?? "todo",
        body.priority ?? "P3",
        body.assignee ?? "agent",
        body.category ?? null,
        body.due_date ?? null,
        body.completed_at ? new Date(body.completed_at) : null,
        body.sort_order ?? nextOrder.rows[0]?.next_order ?? 1,
        JSON.stringify(parseJsonRecord(body.metadata)),
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("[tools/tasks] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
