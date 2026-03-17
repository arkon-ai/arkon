import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { parseInteger, unauthorized, validateAdmin } from "../_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const limit = Math.min(parseInteger(req.nextUrl.searchParams.get("limit"), 10), 50);
    const result = await query(
      `SELECT *
       FROM quick_commands
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json({
      items: result.rows.reverse(),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[tools/commands] GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json();

    if (!body.command || !body.agent_id) {
      return NextResponse.json({ error: "agent_id and command are required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO quick_commands (agent_id, command, response, status, responded_at)
       VALUES ($1, $2, $3, COALESCE($4, 'sent'), $5)
       RETURNING *`,
      [
        body.agent_id,
        body.command,
        body.response ?? null,
        body.status ?? "sent",
        body.responded_at ? new Date(body.responded_at) : null,
      ]
    );

    return NextResponse.json(result.rows[0], { status: 201 });
  } catch (error) {
    console.error("[tools/commands] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
