import { query } from "@/lib/db";
import { sendNotification } from "@/lib/notifications";

// Track which budgets we've already alerted on today to avoid spam
const alertedToday = new Map<string, string>(); // key -> date string
let lastCleanup = 0;

function cleanupAlertedCache() {
  const today = new Date().toISOString().slice(0, 10);
  if (Date.now() - lastCleanup > 3600_000) { // cleanup hourly
    for (const [key, date] of alertedToday) {
      if (date !== today) alertedToday.delete(key);
    }
    lastCleanup = Date.now();
  }
}

/**
 * Check if any budget thresholds are breached for this agent/tenant.
 * Fires a Telegram alert if threshold is crossed for the first time today.
 * Never throws.
 */
export async function checkBudgetThreshold(agentId: string, tenantId: string): Promise<void> {
  try {
    cleanupAlertedCache();
    const today = new Date().toISOString().slice(0, 10);

    // Get budget limits for this agent or tenant
    const budgets = await query(
      `SELECT * FROM budget_limits
       WHERE (scope_type = 'agent' AND scope_id = $1)
          OR (scope_type = 'tenant' AND scope_id = $2)`,
      [agentId, tenantId]
    );

    for (const budget of budgets.rows) {
      const alertKey = `${budget.scope_type}:${budget.scope_id}`;

      // Skip if already alerted today
      if (alertedToday.get(alertKey) === today) continue;

      // Check daily limit
      if (budget.daily_limit_usd) {
        const dailySpend = await query(
          `SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric as spend
           FROM daily_stats
           WHERE day = CURRENT_DATE
             AND ${budget.scope_type === 'tenant' ? 'tenant_id' : 'agent_id'} = $1`,
          [budget.scope_id]
        );
        const spend = parseFloat(dailySpend.rows[0]?.spend || "0");
        const pct = (spend / budget.daily_limit_usd) * 100;

        if (pct >= budget.alert_threshold_pct) {
          alertedToday.set(alertKey, today);
          void sendNotification({
            tenantId,
            type: "budget",
            severity: pct >= 100 ? "critical" : "warning",
            title: `Budget alert: ${alertKey} at ${Math.round(pct)}% of daily limit`,
            body: `Daily spend $${spend.toFixed(4)} / $${budget.daily_limit_usd} limit (${Math.round(pct)}%). Action: ${budget.action_on_exceed}`,
            link: "/costs",
            metadata: { agentId, scope: alertKey, pct: Math.round(pct), period: "daily" },
          });
        }
      }

      // Check monthly limit
      if (budget.monthly_limit_usd) {
        const monthlySpend = await query(
          `SELECT COALESCE(SUM(estimated_cost_usd), 0)::numeric as spend
           FROM daily_stats
           WHERE day >= date_trunc('month', CURRENT_DATE)
             AND ${budget.scope_type === 'tenant' ? 'tenant_id' : 'agent_id'} = $1`,
          [budget.scope_id]
        );
        const spend = parseFloat(monthlySpend.rows[0]?.spend || "0");
        const pct = (spend / budget.monthly_limit_usd) * 100;

        if (pct >= budget.alert_threshold_pct) {
          alertedToday.set(alertKey, today);
          void sendNotification({
            tenantId,
            type: "budget",
            severity: pct >= 100 ? "critical" : "warning",
            title: `Budget alert: ${alertKey} at ${Math.round(pct)}% of monthly limit`,
            body: `Monthly spend $${spend.toFixed(4)} / $${budget.monthly_limit_usd} limit (${Math.round(pct)}%). Action: ${budget.action_on_exceed}`,
            link: "/costs",
            metadata: { agentId, scope: alertKey, pct: Math.round(pct), period: "monthly" },
          });
        }
      }
    }
  } catch (err) {
    // Budget check failure is non-fatal
    console.error("[budget-check] Error:", err);
  }
}
