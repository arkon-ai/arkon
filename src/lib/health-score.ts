/**
 * Composite Health Score (0–100)
 *
 * Four equally-weighted dimensions:
 *   1. Agent Uptime   — are all agents reporting?     (0–25)
 *   2. Threat Level   — severity of recent threats     (0–25)
 *   3. Budget Status  — spend vs limit                 (0–25)
 *   4. Infrastructure — all nodes online?              (0–25)
 */

export interface HealthInput {
  /** Total registered agents */
  totalAgents: number;
  /** Agents active in last hour */
  activeAgents: number;
  /** Highest threat severity in last 24h: "critical"|"high"|"medium"|"low"|"none" */
  highestThreat: string;
  /** Total threats in last 24h */
  threatCount: number;
  /** Current month spend (USD) */
  monthSpend: number;
  /** Monthly budget limit (USD), 0 = no limit */
  budgetLimit: number;
  /** Total infra nodes */
  totalNodes: number;
  /** Online nodes */
  onlineNodes: number;
}

export interface HealthResult {
  score: number;
  grade: "healthy" | "warning" | "critical";
  color: string;
  breakdown: {
    agents: number;
    threats: number;
    budget: number;
    infra: number;
  };
}

const THREAT_SCORES: Record<string, number> = {
  none: 25,
  low: 20,
  medium: 10,
  high: 5,
  critical: 0,
};

export function computeHealthScore(input: HealthInput): HealthResult {
  // 1. Agent uptime (0–25)
  const agents =
    input.totalAgents === 0
      ? 25 // no agents = not penalized
      : Math.round((input.activeAgents / input.totalAgents) * 25);

  // 2. Threat level (0–25)
  const threats = THREAT_SCORES[input.highestThreat] ?? 25;

  // 3. Budget (0–25)
  let budget = 25;
  if (input.budgetLimit > 0) {
    const pct = input.monthSpend / input.budgetLimit;
    if (pct > 1) budget = 0;
    else if (pct > 0.8) budget = 5;
    else if (pct > 0.5) budget = 15;
    else budget = 25;
  }

  // 4. Infrastructure (0–25)
  const infra =
    input.totalNodes === 0
      ? 25
      : Math.round((input.onlineNodes / input.totalNodes) * 25);

  const score = agents + threats + budget + infra;

  let grade: HealthResult["grade"] = "healthy";
  let color = "#00D47E";
  if (score < 50) {
    grade = "critical";
    color = "#ef4444";
  } else if (score < 80) {
    grade = "warning";
    color = "#f59e0b";
  }

  return { score, grade, color, breakdown: { agents, threats, budget, infra } };
}
