import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

// GET /api/dashboard/anomalies?limit=20&unacknowledged=true
export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10), 100);
  const unackOnly = req.nextUrl.searchParams.get("unacknowledged") === "true";

  const result = await query(`
    SELECT
      aa.id, aa.agent_id, a.name AS agent_name,
      aa.anomaly_type, aa.level,
      aa.current_rate, aa.baseline_rate, aa.multiplier,
      aa.created_at, aa.acknowledged
    FROM anomaly_alerts aa
    JOIN agents a ON a.id = aa.agent_id
    ${unackOnly ? "WHERE aa.acknowledged = FALSE" : ""}
    ORDER BY aa.created_at DESC
    LIMIT $1
  `, [limit]);

  return NextResponse.json({ anomalies: result.rows, count: result.rowCount });
}

// PATCH /api/dashboard/anomalies — acknowledge alert
export async function PATCH(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await req.json() as { id?: string };
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await query("UPDATE anomaly_alerts SET acknowledged = TRUE WHERE id = $1", [id]);
  return NextResponse.json({ ok: true });
}
