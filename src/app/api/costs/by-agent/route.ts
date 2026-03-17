import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const interval = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";

  try {
    const result = await query(
      `SELECT ds.agent_id, a.name as agent_name, a.tenant_id,
              SUM(ds.estimated_cost_usd) as total_cost,
              SUM(ds.estimated_tokens) as total_tokens,
              SUM(ds.messages_received + ds.messages_sent) as total_messages,
              SUM(ds.tool_calls) as total_tool_calls,
              COUNT(DISTINCT ds.day) as active_days,
              CASE WHEN SUM(ds.estimated_tokens) > 0
                   THEN SUM(ds.estimated_cost_usd) / SUM(ds.estimated_tokens) * 1000
                   ELSE 0 END as cost_per_1k_tokens
       FROM daily_stats ds
       LEFT JOIN agents a ON a.id = ds.agent_id
       WHERE ds.day >= CURRENT_DATE - $1::interval
       GROUP BY ds.agent_id, a.name, a.tenant_id
       ORDER BY total_cost DESC`,
      [interval]
    );

    // Daily breakdown per agent (for sparklines)
    const daily = await query(
      `SELECT agent_id, day, estimated_cost_usd as cost
       FROM daily_stats
       WHERE day >= CURRENT_DATE - $1::interval
       ORDER BY agent_id, day`,
      [interval]
    );

    const dailyByAgent: Record<string, { day: string; cost: number }[]> = {};
    for (const row of daily.rows) {
      if (!dailyByAgent[row.agent_id]) dailyByAgent[row.agent_id] = [];
      dailyByAgent[row.agent_id].push({ day: row.day, cost: parseFloat(row.cost) });
    }

    return NextResponse.json({
      range,
      agents: result.rows.map((r: Record<string, string>) => ({
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        tenant_id: r.tenant_id,
        total_cost: parseFloat(r.total_cost),
        total_tokens: parseInt(r.total_tokens),
        total_messages: parseInt(r.total_messages),
        total_tool_calls: parseInt(r.total_tool_calls),
        active_days: parseInt(r.active_days),
        cost_per_1k_tokens: parseFloat(r.cost_per_1k_tokens),
        daily_trend: dailyByAgent[r.agent_id] || [],
      })),
    });
  } catch (err) {
    console.error("[costs/by-agent] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
