import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  try {
    const agents = await query(`
      SELECT a.id, a.name, a.metadata, a.created_at, a.tenant_id,
        (SELECT MAX(e.created_at) FROM events e WHERE e.agent_id = a.id) as last_active,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '24 hours') as events_24h,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '7 days') as events_7d,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id) as events_total,
        (SELECT COALESCE(SUM(e.token_estimate), 0) FROM events e WHERE e.agent_id = a.id AND e.created_at > NOW() - INTERVAL '24 hours') as tokens_24h,
        (SELECT COUNT(*) FROM events e WHERE e.agent_id = a.id AND e.threat_level IS NOT NULL AND e.threat_level != 'none' AND e.created_at > NOW() - INTERVAL '30 days') as threats_30d,
        (SELECT COALESCE(SUM(ds.estimated_cost_usd), 0) FROM daily_stats ds WHERE ds.agent_id = a.id AND ds.day > CURRENT_DATE - INTERVAL '30 days') as cost_30d
      FROM agents a
      ORDER BY last_active DESC NULLS LAST
    `);

    const todayStats = await query(`
      SELECT agent_id, tenant_id,
        COALESCE(SUM(messages_received), 0) as received,
        COALESCE(SUM(messages_sent), 0) as sent,
        COALESCE(SUM(tool_calls), 0) as tools,
        COALESCE(SUM(errors), 0) as errors,
        COALESCE(SUM(estimated_tokens), 0) as tokens
      FROM daily_stats
      WHERE day = CURRENT_DATE
      GROUP BY agent_id, tenant_id
    `);

    const tenants = await query(`
      SELECT id, name, domain, plan, created_at FROM tenants ORDER BY name
    `);

    return NextResponse.json({
      agents: agents.rows,
      todayStats: todayStats.rows,
      tenants: tenants.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dashboard/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
