import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/client/dashboard
 * Tenant-scoped dashboard overview for DFY clients.
 * Auth: mc_auth cookie + mc_tenant cookie (set during login)
 */
export async function GET(req: NextRequest) {
  const tenantId = req.cookies.get("mc_tenant")?.value;
  const hasAuth = req.cookies.has("mc_auth") || !!req.headers.get("authorization");

  if (!hasAuth || !tenantId || tenantId === "*") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Tenant info
    const tenantResult = await query(
      "SELECT id, name, domain, plan, created_at FROM tenants WHERE id = $1",
      [tenantId]
    );
    if (tenantResult.rows.length === 0) {
      return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
    }
    const tenant = tenantResult.rows[0] as Record<string, unknown>;

    // Agents for this tenant (derive last_seen from sessions)
    const agentsResult = await query(
      `SELECT a.id, a.name, a.role, a.created_at,
              (SELECT MAX(last_active) FROM sessions s WHERE s.agent_id = a.id) as last_seen_at
       FROM agents a WHERE a.tenant_id = $1
       ORDER BY last_seen_at DESC NULLS LAST`,
      [tenantId]
    );

    // 24h cost summary
    const costResult = await query(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost_24h,
              COALESCE(SUM(estimated_tokens), 0) as tokens_24h
       FROM daily_stats WHERE tenant_id = $1 AND day >= CURRENT_DATE - INTERVAL '24 hours'`,
      [tenantId]
    );

    // 30d cost summary
    const cost30d = await query(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost_30d,
              COALESCE(SUM(estimated_tokens), 0) as tokens_30d
       FROM daily_stats WHERE tenant_id = $1 AND day >= CURRENT_DATE - INTERVAL '30 days'`,
      [tenantId]
    );

    // Recent events (last 20) — use content instead of summary
    const eventsResult = await query(
      `SELECT e.id, e.event_type, LEFT(e.content, 200) as summary, e.created_at, a.name as agent_name
       FROM events e
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE a.tenant_id = $1
       ORDER BY e.created_at DESC LIMIT 20`,
      [tenantId]
    );

    // Active sessions (active in last hour)
    const sessionsResult = await query(
      `SELECT COUNT(*) as active_sessions
       FROM sessions WHERE tenant_id = $1 AND last_active > NOW() - INTERVAL '1 hour'`,
      [tenantId]
    );

    // Infra nodes for this tenant (with latest metrics)
    const infraResult = await query(
      `SELECT n.id, n.name as hostname, n.ip as ip_address, n.os, n.role,
              m.status, m.time as last_seen_at,
              m.cpu_percent, m.memory_used_mb, m.memory_total_mb,
              m.disk_used_gb, m.disk_total_gb
       FROM infra_nodes n
       LEFT JOIN LATERAL (
         SELECT status, time, cpu_percent, memory_used_mb, memory_total_mb, disk_used_gb, disk_total_gb
         FROM node_metrics WHERE node_id = n.id ORDER BY time DESC LIMIT 1
       ) m ON true
       WHERE n.tenant_id = $1
       ORDER BY m.time DESC NULLS LAST`,
      [tenantId]
    );

    return NextResponse.json({
      tenant,
      agents: agentsResult.rows,
      costs: {
        last_24h: {
          cost_usd: parseFloat((costResult.rows[0] as Record<string, string>)?.cost_24h || "0"),
          tokens: parseInt((costResult.rows[0] as Record<string, string>)?.tokens_24h || "0"),
        },
        last_30d: {
          cost_usd: parseFloat((cost30d.rows[0] as Record<string, string>)?.cost_30d || "0"),
          tokens: parseInt((cost30d.rows[0] as Record<string, string>)?.tokens_30d || "0"),
        },
      },
      recent_events: eventsResult.rows,
      active_sessions: parseInt((sessionsResult.rows[0] as Record<string, string>)?.active_sessions || "0"),
      infra_nodes: infraResult.rows,
    });
  } catch (err) {
    console.error("[client/dashboard] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
