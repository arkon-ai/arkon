import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized } from "@/app/api/tools/_utils";
import { resolveTenantAccess, DASHBOARD_CREDENTIALS } from "@/lib/tenant-access";

export async function GET(req: NextRequest) {
  // Every aggregate below is scoped to the caller's tenant (WI-1846). The fleet
  // owner keeps the cross-tenant view ("*"); any other credential is pinned to
  // its own tenant_id by resolveTenantAccess, so a forged ?tenant_id or
  // mc_tenant cookie cannot widen the scope (see tenant-access.test.ts).
  const access = await resolveTenantAccess(req, { allowOwnerWildcard: true });
  if (!access || !DASHBOARD_CREDENTIALS.has(access.credential.type)) {
    return unauthorized();
  }

  const scoped = access.tenantId !== "*";
  const params = scoped ? [access.tenantId] : [];

  try {
    // `events` has no tenant_id — it inherits the agent's via e.agent_id = a.id,
    // so scoping `agents` scopes the event sub-selects (and cost_30d) too.
    // `daily_stats` DOES carry its own tenant_id (NOT NULL since migration 001,
    // backfilled from agents) and todayStats filters it directly — same shape as
    // /api/client/dashboard, and it keeps the idx_daily_stats_tenant index path.
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
      ${scoped ? "WHERE a.tenant_id = $1" : ""}
      ORDER BY last_active DESC NULLS LAST
    `, params);

    const todayStats = await query(`
      SELECT agent_id, tenant_id,
        COALESCE(SUM(messages_received), 0) as received,
        COALESCE(SUM(messages_sent), 0) as sent,
        COALESCE(SUM(tool_calls), 0) as tools,
        COALESCE(SUM(errors), 0) as errors,
        COALESCE(SUM(estimated_tokens), 0) as tokens,
        COALESCE(SUM(estimated_cost_usd), 0) as cost
      FROM daily_stats
      WHERE day = CURRENT_DATE
      ${scoped ? "AND tenant_id = $1" : ""}
      GROUP BY agent_id, tenant_id
    `, params);

    const tenants = await query(`
      SELECT id, name, domain, plan, created_at FROM tenants
      ${scoped ? "WHERE id = $1" : ""}
      ORDER BY name
    `, params);

    // Per-principal since WI-1846 — this body used to be identical for the only
    // caller that could reach it.
    return NextResponse.json(
      {
        agents: agents.rows,
        todayStats: todayStats.rows,
        tenants: tenants.rows,
        timestamp: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[dashboard/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
