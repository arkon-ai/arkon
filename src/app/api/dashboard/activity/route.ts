import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

// GET /api/dashboard/activity?limit=50&since=<iso>
// Returns recent events across all agents for the activity feed
export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10),
    200
  );
  const since = req.nextUrl.searchParams.get("since");

  try {
    const sinceClause = since ? `AND e.created_at > $2` : "";
    const params: unknown[] = [limit];
    if (since) params.push(since);

    const result = await query(`
      SELECT
        e.id,
        e.agent_id,
        a.name AS agent_name,
        e.event_type,
        e.direction,
        e.session_key,
        e.channel_id,
        e.sender,
        e.content,
        e.content_redacted,
        e.token_estimate,
        e.created_at,
        e.threat_level,
        e.threat_classes
      FROM events e
      JOIN agents a ON a.id = e.agent_id
      WHERE 1=1 ${sinceClause}
      ORDER BY e.created_at DESC
      LIMIT $1
    `, params);

    return NextResponse.json({
      events: result.rows,
      count: result.rowCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[activity] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
