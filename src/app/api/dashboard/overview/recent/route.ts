import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  const limit = Math.min(
    parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10),
    20
  );

  try {
    const result = await query(
      `SELECT e.id, a.name as agent_name, e.event_type,
              LEFT(e.content, 120) as content, e.created_at
       FROM events e
       JOIN agents a ON a.id = e.agent_id
       ORDER BY e.created_at DESC
       LIMIT $1`,
      [limit]
    );

    return NextResponse.json({ events: result.rows });
  } catch (err) {
    console.error("[dashboard/overview/recent] Error:", err);
    return NextResponse.json({ events: [] });
  }
}
