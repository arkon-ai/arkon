// src/app/api/workflows/[id]/route.ts — Get, Update, Delete single workflow
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;
    const result = await query(
      `SELECT * FROM workflows WHERE id = $1`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({
      workflow: result.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[workflows/id] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      definition?: Record<string, unknown>;
      status?: string;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
    };

    // Build dynamic SET clause
    const sets: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (body.name !== undefined) { sets.push(`name = $${idx++}`); values.push(body.name); }
    if (body.description !== undefined) { sets.push(`description = $${idx++}`); values.push(body.description); }
    if (body.definition !== undefined) { sets.push(`definition = $${idx++}`); values.push(JSON.stringify(body.definition)); }
    if (body.status !== undefined) { sets.push(`status = $${idx++}`); values.push(body.status); }
    if (body.trigger_type !== undefined) { sets.push(`trigger_type = $${idx++}`); values.push(body.trigger_type); }
    if (body.trigger_config !== undefined) { sets.push(`trigger_config = $${idx++}`); values.push(JSON.stringify(body.trigger_config)); }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE workflows SET ${sets.join(", ")} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ workflow: result.rows[0], ok: true });
  } catch (err) {
    console.error("[workflows/id] PUT error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;
    const result = await query(
      `DELETE FROM workflows WHERE id = $1 RETURNING id, name`,
      [id]
    );

    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: result.rows[0], ok: true });
  } catch (err) {
    console.error("[workflows/id] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
