import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/client/costs
 * Tenant-scoped cost overview for DFY clients.
 * Query: ?range=24h|7d|30d (default 30d)
 */
export async function GET(req: NextRequest) {
  const tenantId = req.cookies.get("mc_tenant")?.value;
  const hasAuth = req.cookies.has("mc_auth") || !!req.headers.get("authorization");

  if (!hasAuth || !tenantId || tenantId === "*") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const range = req.nextUrl.searchParams.get("range") || "30d";
  const interval = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";

  try {
    // Total cost
    const totalResult = await query(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
              COALESCE(SUM(estimated_tokens), 0) as total_tokens,
              COUNT(DISTINCT agent_id) as active_agents
       FROM daily_stats WHERE tenant_id = $1 AND day >= CURRENT_DATE - $2::interval`,
      [tenantId, interval]
    );

    // Daily trend
    const trendResult = await query(
      `SELECT day, SUM(estimated_cost_usd) as cost, SUM(estimated_tokens) as tokens
       FROM daily_stats WHERE tenant_id = $1 AND day >= CURRENT_DATE - $2::interval
       GROUP BY day ORDER BY day`,
      [tenantId, interval]
    );

    // By agent
    const byAgent = await query(
      `SELECT ds.agent_id, a.name as agent_name,
              SUM(ds.estimated_cost_usd) as cost,
              SUM(ds.estimated_tokens) as tokens
       FROM daily_stats ds
       LEFT JOIN agents a ON a.id = ds.agent_id
       WHERE ds.tenant_id = $1 AND ds.day >= CURRENT_DATE - $2::interval
       GROUP BY ds.agent_id, a.name ORDER BY cost DESC`,
      [tenantId, interval]
    );

    // Budget limits for this tenant
    const budgets = await query(
      `SELECT bl.*,
              COALESCE((SELECT SUM(estimated_cost_usd) FROM daily_stats
                        WHERE day = CURRENT_DATE AND tenant_id = $1), 0) as today_spend,
              COALESCE((SELECT SUM(estimated_cost_usd) FROM daily_stats
                        WHERE day >= date_trunc('month', CURRENT_DATE) AND tenant_id = $1), 0) as month_spend
       FROM budget_limits bl WHERE bl.tenant_id = $1`,
      [tenantId]
    );

    return NextResponse.json({
      summary: {
        total_cost_usd: parseFloat((totalResult.rows[0] as Record<string, string>)?.total_cost || "0"),
        total_tokens: parseInt((totalResult.rows[0] as Record<string, string>)?.total_tokens || "0"),
        active_agents: parseInt((totalResult.rows[0] as Record<string, string>)?.active_agents || "0"),
        range,
      },
      daily_trend: trendResult.rows.map((r: Record<string, string>) => ({
        day: r.day,
        cost: parseFloat(r.cost),
        tokens: parseInt(r.tokens),
      })),
      by_agent: byAgent.rows.map((r: Record<string, string>) => ({
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        cost: parseFloat(r.cost),
        tokens: parseInt(r.tokens),
      })),
      budgets: budgets.rows,
    });
  } catch (err) {
    console.error("[client/costs] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
