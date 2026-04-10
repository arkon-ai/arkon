import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
  return unauthorized();
  }

  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const tenantId = url.searchParams.get("tenant_id");

  const interval = range === "24h" ? "24 hours" : range === "7d" ? "7 days" : "30 days";
  const tenantFilter = tenantId ? "AND ds.tenant_id = $2" : "";
  const params: (string | number)[] = [interval];
  if (tenantId) params.push(tenantId);

  try {
    // Total cost this period (with input/output token breakdown)
    const totalCost = await query(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as total_cost,
              COALESCE(SUM(estimated_tokens), 0) as total_tokens,
              COALESCE(SUM(input_tokens), 0) as total_input_tokens,
              COALESCE(SUM(output_tokens), 0) as total_output_tokens,
              COUNT(DISTINCT agent_id) as active_agents
       FROM daily_stats ds
       WHERE day >= CURRENT_DATE - $1::interval ${tenantFilter}`,
      params
    );

    // Daily cost trend
    const dailyCost = await query(
      `SELECT day, SUM(estimated_cost_usd) as cost, SUM(estimated_tokens) as tokens,
              SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens
       FROM daily_stats ds
       WHERE day >= CURRENT_DATE - $1::interval ${tenantFilter}
       GROUP BY day ORDER BY day`,
      params
    );

    // Cost by agent (top 10)
    const byAgent = await query(
      `SELECT ds.agent_id, a.name as agent_name,
              SUM(ds.estimated_cost_usd) as cost,
              SUM(ds.estimated_tokens) as tokens
       FROM daily_stats ds
       LEFT JOIN agents a ON a.id = ds.agent_id
       WHERE ds.day >= CURRENT_DATE - $1::interval ${tenantFilter}
       GROUP BY ds.agent_id, a.name
       ORDER BY cost DESC LIMIT 10`,
      params
    );

    // Cost by tenant
    const byTenant = await query(
      `SELECT ds.tenant_id, SUM(ds.estimated_cost_usd) as cost,
              SUM(ds.estimated_tokens) as tokens
       FROM daily_stats ds
       WHERE ds.day >= CURRENT_DATE - $1::interval
       GROUP BY ds.tenant_id ORDER BY cost DESC`,
      [interval]
    );

    // Last month total (for comparison)
    const lastMonthParams = tenantId ? [tenantId] : [];
    const lastMonthTenantFilter = tenantId ? "AND ds.tenant_id = $1" : "";
    const lastMonth = await query(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost
       FROM daily_stats ds
       WHERE day >= date_trunc('month', CURRENT_DATE) - interval '1 month'
         AND day < date_trunc('month', CURRENT_DATE)
         ${lastMonthTenantFilter}`,
      lastMonthParams
    );

    // 7-day average cost per agent (for anomaly detection)
    const anomalyTenantFilter = tenantId ? "AND ds.tenant_id = $1" : "";
    const anomalyParams = tenantId ? [tenantId] : [];
    const agentAvg7d = await query(
      `SELECT agent_id,
              COALESCE(AVG(estimated_cost_usd), 0) as avg_daily_cost
       FROM daily_stats ds
       WHERE day >= CURRENT_DATE - interval '7 days'
         AND day < CURRENT_DATE
         ${anomalyTenantFilter}
       GROUP BY agent_id`,
      anomalyParams
    );

    // Today's cost per agent (for anomaly comparison)
    const agentToday = await query(
      `SELECT agent_id,
              COALESCE(SUM(estimated_cost_usd), 0) as today_cost
       FROM daily_stats ds
       WHERE day = CURRENT_DATE
         ${anomalyTenantFilter}
       GROUP BY agent_id`,
      anomalyParams
    );

    // Budget status
    const budgets = await query(
      `SELECT bl.*,
              COALESCE((SELECT SUM(estimated_cost_usd) FROM daily_stats
                        WHERE day = CURRENT_DATE
                        AND (bl.scope_type = 'tenant' AND tenant_id = bl.scope_id
                             OR bl.scope_type = 'agent' AND agent_id = bl.scope_id)), 0) as today_spend,
              COALESCE((SELECT SUM(estimated_cost_usd) FROM daily_stats
                        WHERE day >= date_trunc('month', CURRENT_DATE)
                        AND (bl.scope_type = 'tenant' AND tenant_id = bl.scope_id
                             OR bl.scope_type = 'agent' AND agent_id = bl.scope_id)), 0) as month_spend
       FROM budget_limits bl`
    );

    // Cost accuracy score: % of events with actual token data
    const accuracyResult = await query(
      `SELECT
         COUNT(*) as total_events,
         COUNT(input_tokens) as events_with_actual_tokens
       FROM events
       WHERE created_at >= NOW() - $1::interval`,
      [interval]
    );
    const totalEvents = parseInt(accuracyResult.rows[0]?.total_events || "0");
    const eventsWithActual = parseInt(accuracyResult.rows[0]?.events_with_actual_tokens || "0");
    const accuracyPct = totalEvents > 0 ? Math.round((eventsWithActual / totalEvents) * 100) : 0;

    // Phase 4: Infrastructure costs — active only, with per-tenant allocation
    const infraResult = await query(
      `SELECT id, name, category, monthly_cost_usd, tenant_allocations, notes
       FROM infra_costs
       WHERE active = true
       ORDER BY category, name`
    );
    const infraRows = infraResult.rows;
    const totalInfraMonthly = infraRows.reduce(
      (sum, r) => sum + parseFloat(r.monthly_cost_usd),
      0
    );
    // Per-tenant infra allocation
    const infraPerTenant: Record<string, number> = {};
    for (const cost of infraRows) {
      const allocations = (cost.tenant_allocations || {}) as Record<string, number>;
      const amount = parseFloat(cost.monthly_cost_usd);
      for (const [tenant, pct] of Object.entries(allocations)) {
        infraPerTenant[tenant] = (infraPerTenant[tenant] || 0) + amount * pct;
      }
    }

    // Total monthly burn = API cost (this month) + prorated infra
    const monthApiTenantFilter = tenantId ? "AND ds.tenant_id = $1" : "";
    const monthApiParams = tenantId ? [tenantId] : [];
    const monthApiCostResult = await query(
      `SELECT COALESCE(SUM(estimated_cost_usd), 0) as cost
       FROM daily_stats ds
       WHERE day >= date_trunc('month', CURRENT_DATE) ${monthApiTenantFilter}`,
      monthApiParams
    );
    const monthApiCost = parseFloat(monthApiCostResult.rows[0]?.cost || "0");
    const tenantInfraShare = tenantId ? (infraPerTenant[tenantId] || 0) : totalInfraMonthly;
    const totalMonthlyBurn = monthApiCost + tenantInfraShare;

    return NextResponse.json({
      summary: {
        total_cost_usd: parseFloat(totalCost.rows[0]?.total_cost || "0"),
        total_tokens: parseInt(totalCost.rows[0]?.total_tokens || "0"),
        total_input_tokens: parseInt(totalCost.rows[0]?.total_input_tokens || "0"),
        total_output_tokens: parseInt(totalCost.rows[0]?.total_output_tokens || "0"),
        active_agents: parseInt(totalCost.rows[0]?.active_agents || "0"),
        cost_accuracy_pct: accuracyPct,
        range,
        total_monthly_burn_usd: Math.round(totalMonthlyBurn * 100) / 100,
        month_api_cost_usd: Math.round(monthApiCost * 100) / 100,
        month_infra_cost_usd: Math.round(tenantInfraShare * 100) / 100,
      },
      daily_trend: dailyCost.rows.map((r: Record<string, string>) => ({
        day: r.day,
        cost: parseFloat(r.cost),
        tokens: parseInt(r.tokens),
        input_tokens: parseInt(r.input_tokens),
        output_tokens: parseInt(r.output_tokens),
      })),
      by_agent: byAgent.rows.map((r: Record<string, string>) => ({
        agent_id: r.agent_id,
        agent_name: r.agent_name,
        cost: parseFloat(r.cost),
        tokens: parseInt(r.tokens),
      })),
      by_tenant: byTenant.rows.map((r: Record<string, string>) => ({
        tenant_id: r.tenant_id,
        cost: parseFloat(r.cost),
        tokens: parseInt(r.tokens),
      })),
      budgets: budgets.rows.map((r: Record<string, unknown>) => ({
        ...r,
        daily_limit_usd: r.daily_limit_usd != null ? parseFloat(String(r.daily_limit_usd)) : null,
        monthly_limit_usd: r.monthly_limit_usd != null ? parseFloat(String(r.monthly_limit_usd)) : null,
        alert_threshold_pct: parseInt(String(r.alert_threshold_pct)) || 80,
        today_spend: parseFloat(String(r.today_spend)) || 0,
        month_spend: parseFloat(String(r.month_spend)) || 0,
      })),
      last_month_cost: parseFloat(lastMonth.rows[0]?.cost || "0"),
      infra_costs: {
        items: infraRows.map((r: Record<string, unknown>) => ({
          id: r.id,
          name: r.name,
          category: r.category,
          monthly_cost_usd: parseFloat(String(r.monthly_cost_usd)),
          tenant_allocations: r.tenant_allocations,
          notes: r.notes,
        })),
        total_monthly_usd: Math.round(totalInfraMonthly * 100) / 100,
        per_tenant_monthly: Object.fromEntries(
          Object.entries(infraPerTenant).map(([k, v]) => [k, Math.round(v * 100) / 100])
        ),
      },
      agent_anomalies: (() => {
        const avgMap: Record<string, number> = {};
        for (const r of agentAvg7d.rows) avgMap[r.agent_id] = parseFloat(r.avg_daily_cost);
        const anomalies: Array<{ agent_id: string; agent_name: string; today_cost: number; avg_7d: number; ratio: number }> = [];
        for (const r of agentToday.rows) {
          const todayCost = parseFloat(r.today_cost);
          const avg = avgMap[r.agent_id] || 0;
          if (avg > 0 && todayCost > avg * 2) {
            const agentRow = byAgent.rows.find((a: Record<string, string>) => a.agent_id === r.agent_id);
            anomalies.push({
              agent_id: r.agent_id,
              agent_name: agentRow?.agent_name || r.agent_id,
              today_cost: todayCost,
              avg_7d: avg,
              ratio: todayCost / avg,
            });
          }
        }
        return anomalies.sort((a, b) => b.ratio - a.ratio);
      })(),
    });
  } catch (err) {
    console.error("[costs/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
