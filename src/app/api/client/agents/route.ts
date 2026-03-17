import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/client/agents
 * Tenant-scoped agent list with stats for DFY clients.
 */
export async function GET(req: NextRequest) {
  const tenantId = req.cookies.get("mc_tenant")?.value;
  const hasAuth = req.cookies.has("mc_auth") || !!req.headers.get("authorization");

  if (!hasAuth || !tenantId || tenantId === "*") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await query(
      `SELECT a.id, a.name, a.role, a.created_at,
              (SELECT MAX(last_active) FROM sessions s WHERE s.agent_id = a.id) as last_seen_at,
              COALESCE(ds.total_cost, 0) as cost_30d,
              COALESCE(ds.total_tokens, 0) as tokens_30d,
              COALESCE(ds.total_messages, 0) as messages_30d
       FROM agents a
       LEFT JOIN LATERAL (
         SELECT SUM(estimated_cost_usd) as total_cost,
                SUM(estimated_tokens) as total_tokens,
                SUM(messages_received + messages_sent) as total_messages
         FROM daily_stats
         WHERE agent_id = a.id AND day >= CURRENT_DATE - INTERVAL '30 days'
       ) ds ON true
       WHERE a.tenant_id = $1
       ORDER BY last_seen_at DESC NULLS LAST`,
      [tenantId]
    );

    return NextResponse.json({ agents: result.rows });
  } catch (err) {
    console.error("[client/agents] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
