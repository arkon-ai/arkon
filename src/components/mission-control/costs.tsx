"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CostsEmpty } from "./empty-states";
import { SectionDescription } from "./dashboard-clarity";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Plus, Trash2, X } from "lucide-react";

/* ── colour tokens (matches existing charts.tsx palette) ── */
const C = {
  green: "#00D47E", purple: "#00D47E", amber: "#f59e0b",
  red: "#ef4444", slate: "#8888A0", teal: "#14b8a6",
  pink: "#ec4899", blue: "#3b82f6",
  grid: "#1E1E2A", tooltipBg: "#111118",
};
const AGENT_COLORS = [C.green, C.purple, C.amber, C.teal, C.pink, C.blue, C.red, C.slate];

/* ── tiny helpers ── */
function fmt$(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(4)}`;
}
function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}
function pctOf(spent: number, limit: number): number {
  return limit > 0 ? Math.min((spent / limit) * 100, 100) : 0;
}

/* ── data interfaces ── */
interface CostSummary {
  total_cost_usd: number;
  total_tokens: number;
  active_agents: number;
  range: string;
}
interface DailyTrend { day: string; cost: number; tokens: number }
interface AgentCost { agent_id: string; agent_name: string; cost: number; tokens: number }
interface TenantCost { tenant_id: string; cost: number; tokens: number }
interface BudgetRow {
  id: number; scope_type: string; scope_id: string;
  daily_limit_usd: number | null; monthly_limit_usd: number | null;
  alert_threshold_pct: number; action_on_exceed: string;
  today_spend: number; month_spend: number;
}
interface AgentAnomaly {
  agent_id: string; agent_name: string;
  today_cost: number; avg_7d: number; ratio: number;
}
interface OverviewData {
  summary: CostSummary;
  daily_trend: DailyTrend[];
  by_agent: AgentCost[];
  by_tenant: TenantCost[];
  budgets: BudgetRow[];
  last_month_cost: number;
  agent_anomalies: AgentAnomaly[];
}
interface AgentDetailRow {
  agent_id: string; agent_name: string; tenant_id: string;
  total_cost: number; total_tokens: number; total_messages: number;
  total_tool_calls: number; active_days: number; cost_per_1k_tokens: number;
  daily_trend: { day: string; cost: number }[];
}
interface ModelRow {
  provider: string; model: string; display_name: string;
  event_count: number; total_tokens: number; estimated_cost: number; is_free: boolean;
}

/* ── fetch wrapper ── */
async function apiFetch<T>(url: string): Promise<T> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-csrf-token": csrf },
  });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── stat card ── */
function StatCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
    >
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--text-secondary)]">{sub}</p>}
    </motion.div>
  );
}

/* (BudgetBar replaced by BudgetProgress in OverviewTab) */

/* ── range selector ── */
function RangeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-[var(--bg-surface)] p-1">
      {["24h", "7d", "30d"].map((r) => (
        <button key={r} onClick={() => onChange(r)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            value === r ? "bg-[var(--bg-surface-2)] text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          }`}>{r}</button>
      ))}
    </div>
  );
}

/* ── custom tooltip ── */
function CostTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-xl">
      <p className="text-[var(--text-secondary)] mb-1">{label}</p>
      <p className="text-white font-medium">{fmt$(payload[0].value)}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function CostsScreen() {
  const [range, setRange] = useState("30d");
  const [tab, setTab] = useState<"overview" | "agents" | "models" | "pricing">("overview");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [agentData, setAgentData] = useState<AgentDetailRow[] | null>(null);
  const [modelData, setModelData] = useState<ModelRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey(k => k + 1);

  // Fetch on mount + range/tab change
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const fetches: Promise<void>[] = [];

    // Always fetch overview
    fetches.push(
      apiFetch<OverviewData>(`/api/costs/overview?range=${range}`).then((d) => {
        if (!cancelled) setOverview(d);
      })
    );

    if (tab === "agents" || tab === "overview") {
      fetches.push(
        apiFetch<{ agents: AgentDetailRow[] }>(`/api/costs/by-agent?range=${range}`).then((d) => {
          if (!cancelled) setAgentData(d.agents);
        })
      );
    }
    if (tab === "models") {
      fetches.push(
        apiFetch<{ models: ModelRow[] }>(`/api/costs/by-model?range=${range}`).then((d) => {
          if (!cancelled) setModelData(d.models);
        })
      );
    }

    Promise.all(fetches)
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [range, tab, refreshKey]);

  /* ── estimated daily burn ── */
  const dailyBurn = useMemo(() => {
    if (!overview?.daily_trend.length) return 0;
    const recent = overview.daily_trend.slice(-7);
    return recent.reduce((s, d) => s + d.cost, 0) / recent.length;
  }, [overview]);

  /* ── projected monthly ── */
  const projected = dailyBurn * 30;

  // CSV export for client reports
  const exportCostCSV = () => {
    if (!overview || !agentData) return;
    const rows: string[] = [];
    rows.push("Agent,Tenant,Total Cost (USD),Total Tokens,Messages,Tool Calls,Active Days,Cost per 1K Tokens");
    for (const a of agentData) {
      rows.push([
        a.agent_name || a.agent_id,
        a.tenant_id,
        a.total_cost.toFixed(4),
        a.total_tokens,
        a.total_messages,
        a.total_tool_calls,
        a.active_days,
        a.cost_per_1k_tokens.toFixed(4),
      ].join(","));
    }
    rows.push("");
    rows.push(`Period,${range}`);
    rows.push(`Total Spend,${overview.summary.total_cost_usd.toFixed(4)}`);
    rows.push(`Total Tokens,${overview.summary.total_tokens}`);
    rows.push(`Active Agents,${overview.summary.active_agents}`);
    rows.push(`Daily Burn (7d avg),${dailyBurn.toFixed(4)}`);
    rows.push(`Projected Monthly,${projected.toFixed(4)}`);

    const blob = new Blob([rows.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `arkon-cost-report-${range}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">Cost Tracker</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">AI spend across all agents and models</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCostCSV}
            disabled={!overview || !agentData}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
          <RangeSelector value={range} onChange={setRange} />
        </div>
      </div>

      <SectionDescription id="costs">
        Track how much your AI agents are spending across all model providers. See daily burn rate,
        per-agent breakdown, and per-model costs. Set budget limits to prevent overspending.
      </SectionDescription>

      {error && (
        <div className="rounded-[16px] border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(["overview", "agents", "models", "pricing"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-[rgba(0,212,126,0.15)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}>{t === "overview" ? "Overview" : t === "agents" ? "By Agent" : t === "models" ? "By Model" : "Pricing"}</button>
        ))}
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : tab === "overview" ? (
        <OverviewTab overview={overview} dailyBurn={dailyBurn} projected={projected} agentData={agentData} onBudgetChange={refresh} />
      ) : tab === "agents" ? (
        <AgentsTab agents={agentData} loading={loading} anomalies={overview?.agent_anomalies || []} />
      ) : tab === "models" ? (
        <ModelsTab models={modelData} loading={loading} />
      ) : (
        <PricingTab />
      )}
    </div>
  );
}

/* ═══ Budget Progress Bar (enhanced with projection) ═══ */
function BudgetProgress({ label, spent, limit, threshold, dailyBurn, isMonthly }: {
  label: string; spent: number; limit: number; threshold: number; dailyBurn: number; isMonthly: boolean;
}) {
  const pct = pctOf(spent, limit);
  const barColor = pct >= 100 ? C.red : pct >= threshold ? C.amber : C.green;

  // Project when limit will be hit (only for monthly)
  let projectionText = "";
  if (isMonthly && dailyBurn > 0 && pct < 100) {
    const remaining = limit - spent;
    const daysUntilLimit = remaining / dailyBurn;
    const now = new Date();
    const daysLeftInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
    const projectedTotal = spent + (dailyBurn * daysLeftInMonth);

    if (daysUntilLimit <= daysLeftInMonth) {
      const hitDate = new Date(now.getTime() + daysUntilLimit * 86400000);
      projectionText = `At current rate, hits limit ${hitDate.toLocaleDateString("en", { month: "short", day: "numeric" })}`;
    } else if (projectedTotal < limit) {
      projectionText = `On track — projected ${fmt$(projectedTotal)} is under limit`;
    }
  }

  return (
    <div className="mb-4">
      <div className="flex justify-between text-xs mb-1.5">
        <span className="text-[var(--text-secondary)] font-medium">{label}</span>
        <span className="text-[var(--text-secondary)]">
          {fmt$(spent)} / {fmt$(limit)}
          <span className="ml-1.5 font-medium" style={{ color: barColor }}>({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-[var(--bg-surface-2)] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        {/* Threshold marker */}
        <div className="absolute top-0 h-full w-px bg-[var(--text-tertiary)]" style={{ left: `${threshold}%` }} />
      </div>
      {projectionText && (
        <p className="text-[10px] mt-1" style={{ color: pct >= threshold ? C.amber : "#555566" }}>{projectionText}</p>
      )}
    </div>
  );
}

/* ═══ Cost Anomaly Alert ═══ */
function AnomalyAlert({ anomalies }: { anomalies: AgentAnomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <div className="rounded-[16px] border border-[var(--warning)]/30 bg-[var(--warning)]/5 p-4">
      <h3 className="text-sm font-medium text-[var(--warning)] mb-2">Spending Anomalies Detected</h3>
      <div className="space-y-2">
        {anomalies.map((a) => (
          <div key={a.agent_id} className="flex items-center justify-between text-xs">
            <span className="text-[var(--text-primary)]">
              <span className="font-medium">{a.agent_name}</span>
              <span className="text-[var(--warning)] ml-2">{a.ratio.toFixed(1)}x higher than 7-day average</span>
            </span>
            <span className="text-[var(--text-secondary)]">
              Today: <span className="text-white">{fmt$(a.today_cost)}</span>
              <span className="mx-1">vs</span>
              avg: <span className="text-white">{fmt$(a.avg_7d)}</span>/day
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══ Optimization Tips ═══ */
function OptimizationTips({ overview, agentData }: { overview: OverviewData; agentData: AgentDetailRow[] | null }) {
  const [expanded, setExpanded] = useState(true);
  const tips: Array<{ text: string; savings?: string; color: string; priority: number }> = [];

  // Tip: budget nearly exceeded (highest priority)
  for (const b of overview.budgets) {
    if (b.monthly_limit_usd && b.month_spend / b.monthly_limit_usd > 0.8) {
      tips.push({
        text: `Budget for ${b.scope_type}:${b.scope_id} is at ${Math.round((b.month_spend / b.monthly_limit_usd) * 100)}%. Consider reviewing high-cost agents.`,
        color: C.red,
        priority: 0,
      });
    }
  }

  // Tip: model downgrade suggestions
  if (agentData) {
    for (const a of agentData) {
      const costPerMsg = a.total_cost / Math.max(a.total_messages, 1);
      if (costPerMsg > 0.05 && a.total_cost > 2) {
        const potentialSavings = a.total_cost * 0.6;
        tips.push({
          text: `${a.agent_name || a.agent_id} averages ${fmt$(costPerMsg)}/msg. Switching sub-tasks to a smaller model could reduce costs.`,
          savings: potentialSavings > 1 ? `~${fmt$(potentialSavings)}/period` : undefined,
          color: C.teal,
          priority: 1,
        });
      }
    }
  }

  // Tip: anomaly cost alerts — agents spending >2x their 7-day average
  if (overview.agent_anomalies && overview.agent_anomalies.length > 0) {
    for (const anom of overview.agent_anomalies) {
      tips.push({
        text: `${anom.agent_name || anom.agent_id} is spending ${anom.ratio?.toFixed(1) ?? ">2"}x its 7-day average. Investigate for runaway loops.`,
        color: C.red,
        priority: 1,
      });
    }
  }

  // Tip: high cost per message
  if (agentData) {
    for (const a of agentData) {
      if (a.total_messages > 0) {
        const costPerMsg = a.total_cost / Math.max(a.total_messages, 1);
        if (costPerMsg > 0.1 && a.total_cost > 1) {
          tips.push({
            text: `${a.agent_name || a.agent_id} has high cost per message (${fmt$(costPerMsg)}). Check for retries or excessive tool calls.`,
            color: C.amber,
            priority: 2,
          });
        }
      }
    }
  }

  // Tip: inactive agents
  if (agentData) {
    const inactive = agentData.filter((a) => a.active_days <= 2 && a.total_cost > 0);
    if (inactive.length > 0) {
      tips.push({
        text: `${inactive.length} agent${inactive.length > 1 ? "s" : ""} active for 2 or fewer days in this period. Consider deactivating unused agents.`,
        color: C.slate,
        priority: 3,
      });
    }
  }

  // Tip: no budget set
  if (overview.budgets.length === 0 && overview.summary.total_cost_usd > 0) {
    tips.push({
      text: "No budget limits configured. Set a monthly budget to prevent overspending.",
      color: C.purple,
      priority: 2,
    });
  }

  // Sort by priority
  tips.sort((a, b) => a.priority - b.priority);

  if (tips.length === 0) return null;

  return (
    <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <button type="button" onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full text-left">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">
          Optimization Tips
          <span className="ml-2 rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">{tips.length}</span>
        </h3>
        <span className="text-xs text-[var(--text-tertiary)]">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2.5">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2.5 rounded-xl border border-[var(--border)]/50 bg-[var(--bg-primary)]/60 px-3 py-2.5">
              <span className="shrink-0 mt-1 w-2 h-2 rounded-full" style={{ backgroundColor: tip.color }} />
              <div className="min-w-0 flex-1">
                <span className="text-xs leading-relaxed text-[var(--text-secondary)]">{tip.text}</span>
                {tip.savings && (
                  <span className="ml-2 inline-flex rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                    Save {tip.savings}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ Overview Tab ═══ */
function OverviewTab({ overview, dailyBurn, projected, agentData, onBudgetChange }: {
  overview: OverviewData | null; dailyBurn: number; projected: number; agentData: AgentDetailRow[] | null; onBudgetChange?: () => void;
}) {
  const [showBudgetDialog, setShowBudgetDialog] = useState(false);
  if (!overview) return null;
  const { summary, daily_trend, by_agent, by_tenant, budgets, last_month_cost, agent_anomalies } = overview;

  // Month-over-month comparison
  const monthDelta = last_month_cost > 0 ? ((projected - last_month_cost) / last_month_cost) * 100 : 0;
  const monthDeltaStr = last_month_cost > 0
    ? `${monthDelta > 0 ? "+" : ""}${monthDelta.toFixed(0)}% vs last month`
    : "";

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label={`Total Spend (${summary.range})`} value={fmt$(summary.total_cost_usd)} color={C.green} />
        <StatCard label="Daily Burn (7d avg)" value={fmt$(dailyBurn)} color={C.amber} />
        <StatCard
          label="Projected Monthly"
          value={`~${fmt$(projected)}`}
          sub={monthDeltaStr}
          color={monthDelta > 20 ? C.red : monthDelta > 0 ? C.amber : C.green}
        />
        <StatCard label="Total Tokens" value={fmtK(summary.total_tokens)} color={C.purple} />
        <StatCard label="Active Agents" value={String(summary.active_agents)} color={C.teal} />
      </div>

      {/* Anomaly alerts */}
      <AnomalyAlert anomalies={agent_anomalies} />

      {/* Budget progress (enhanced) */}
      {budgets.length > 0 && (
        <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-[var(--text-secondary)]">Budget Status</h3>
            <button
              onClick={() => setShowBudgetDialog(true)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)]"
            >
              <Plus className="h-3 w-3" /> Add Budget
            </button>
          </div>
          {budgets.map((b) => (
            <React.Fragment key={b.id}>
              {b.daily_limit_usd != null && (
                <BudgetProgress
                  label={`${b.scope_type}:${b.scope_id} (daily)`}
                  spent={b.today_spend}
                  limit={b.daily_limit_usd}
                  threshold={b.alert_threshold_pct}
                  dailyBurn={dailyBurn}
                  isMonthly={false}
                />
              )}
              {b.monthly_limit_usd != null && (
                <BudgetProgress
                  label={`${b.scope_type}:${b.scope_id} (monthly)`}
                  spent={b.month_spend}
                  limit={b.monthly_limit_usd}
                  threshold={b.alert_threshold_pct}
                  dailyBurn={dailyBurn}
                  isMonthly={true}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      )}

      {budgets.length === 0 && summary.total_cost_usd > 0 && (
        <div className="rounded-[16px] border border-dashed border-[var(--border)] bg-[var(--bg-surface)]/50 p-4 text-center">
          <p className="text-sm text-[var(--text-secondary)]">No budget limits configured.</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Set a budget to track spending against a target and get alerts.</p>
          <button
            onClick={() => setShowBudgetDialog(true)}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" /> Set Budget
          </button>
        </div>
      )}

      {/* Cost trend chart */}
      <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Daily Cost Trend</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={daily_trend}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="day" tick={{ fill: "#555566", fontSize: 11 }}
              tickFormatter={(v: string) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })} />
            <YAxis tick={{ fill: "#555566", fontSize: 11 }} tickFormatter={(v: number) => fmt$(v)} />
            <Tooltip content={<CostTooltip />} />
            <Area type="monotone" dataKey="cost" stroke={C.green} fill="url(#costGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top agents by cost */}
        <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Top Agents by Cost</h3>
          {by_agent.length === 0 ? (
            <CostsEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={by_agent.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: "#555566", fontSize: 11 }} tickFormatter={(v: number) => fmt$(v)} />
                <YAxis type="category" dataKey="agent_name" tick={{ fill: "#8888A0", fontSize: 11 }} width={100} />
                <Tooltip content={<CostTooltip />} />
                <Bar dataKey="cost" radius={[0, 4, 4, 0]}>
                  {by_agent.slice(0, 6).map((_: AgentCost, i: number) => (
                    <Cell key={i} fill={AGENT_COLORS[i % AGENT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tenant breakdown */}
        <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Tenant Spend</h3>
          {by_tenant.map((t) => (
            <div key={t.tenant_id} className="flex items-center justify-between py-2 border-b border-[var(--border)]/50 last:border-0">
              <span className="text-sm text-[var(--text-primary)]">{t.tenant_id}</span>
              <div className="text-right">
                <span className="text-sm font-medium text-white">{fmt$(t.cost)}</span>
                <span className="text-xs text-[var(--text-tertiary)] ml-2">{fmtK(t.tokens)} tokens</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimization Tips */}
      {/* Budget dialog */}
      {showBudgetDialog && (
        <BudgetDialog
          agents={overview.by_agent}
          existingBudgets={overview.budgets}
          onClose={() => setShowBudgetDialog(false)}
          onSaved={() => { setShowBudgetDialog(false); onBudgetChange?.(); }}
        />
      )}
      <OptimizationTips overview={overview} agentData={agentData} />
    </div>
  );
}

/* ═══ Agents Tab ═══ */
function AgentsTab({ agents, loading, anomalies }: { agents: AgentDetailRow[] | null; loading: boolean; anomalies: AgentAnomaly[] }) {
  const anomalyMap = useMemo(() => {
    const m: Record<string, AgentAnomaly> = {};
    for (const a of anomalies) m[a.agent_id] = a;
    return m;
  }, [anomalies]);
  if (loading || !agents) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (agents.length === 0) {
    return <CostsEmpty />;
  }

  return (
    <div className="space-y-3">
      {agents.map((a, i) => (
        <motion.div key={a.agent_id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05 }}
          className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-4"
        >
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-white">{a.agent_name || a.agent_id}</h4>
                {anomalyMap[a.agent_id] && (
                  <span className="inline-flex items-center rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]">
                    {anomalyMap[a.agent_id].ratio.toFixed(1)}x avg
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">{a.tenant_id} · {a.active_days}d active</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold" style={{ color: AGENT_COLORS[i % AGENT_COLORS.length] }}>
                {fmt$(a.total_cost)}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">{fmtK(a.total_tokens)} tokens</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-[var(--text-tertiary)]">Messages</span><p className="text-[var(--text-secondary)]">{a.total_messages}</p></div>
            <div><span className="text-[var(--text-tertiary)]">Tool Calls</span><p className="text-[var(--text-secondary)]">{a.total_tool_calls}</p></div>
            <div><span className="text-[var(--text-tertiary)]">$/1K tokens</span><p className="text-[var(--text-secondary)]">{fmt$(a.cost_per_1k_tokens)}</p></div>
          </div>
          {a.daily_trend.length > 1 && (
            <div className="mt-3 h-12">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={a.daily_trend}>
                  <Area type="monotone" dataKey="cost"
                    stroke={AGENT_COLORS[i % AGENT_COLORS.length]}
                    fill={AGENT_COLORS[i % AGENT_COLORS.length]}
                    fillOpacity={0.15} strokeWidth={1.5} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}

/* ═══ Models Tab ═══ */
function ModelsTab({ models, loading }: { models: ModelRow[] | null; loading: boolean }) {
  if (loading || !models) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  if (models.length === 0) {
    return <CostsEmpty />;
  }

  const paid = models.filter((m) => !m.is_free);
  const free = models.filter((m) => m.is_free);

  return (
    <div className="space-y-6">
      {/* Paid models */}
      {paid.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Paid Models</h3>
          <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-tertiary)] text-xs">
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">Provider</th>
                  <th className="text-right p-3 font-medium">Events</th>
                  <th className="text-right p-3 font-medium">Tokens</th>
                  <th className="text-right p-3 font-medium">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((m) => (
                  <tr key={`${m.provider}::${m.model}`} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="p-3 text-white">{m.display_name}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{m.provider}</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">{m.event_count}</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">{fmtK(m.total_tokens)}</td>
                    <td className="p-3 text-right font-medium text-[var(--warning)]">{fmt$(m.estimated_cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Free models */}
      {free.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Free / Local Models</h3>
          <div className="relative card-hover rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-tertiary)] text-xs">
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">Provider</th>
                  <th className="text-right p-3 font-medium">Events</th>
                  <th className="text-right p-3 font-medium">Tokens</th>
                  <th className="text-right p-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {free.map((m) => (
                  <tr key={`${m.provider}::${m.model}`} className="border-b border-[var(--border)]/50 last:border-0">
                    <td className="p-3 text-white">{m.display_name}</td>
                    <td className="p-3 text-[var(--text-secondary)]">{m.provider}</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">{m.event_count}</td>
                    <td className="p-3 text-right text-[var(--text-secondary)]">{fmtK(m.total_tokens)}</td>
                    <td className="p-3 text-right text-[var(--accent)]">Free</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* === Budget Management Dialog === */
function BudgetDialog({ agents, existingBudgets, onClose, onSaved }: {
  agents: AgentCost[];
  existingBudgets: BudgetRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [scopeType, setScopeType] = useState<"agent" | "tenant">("agent");
  const [scopeId, setScopeId] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [action, setAction] = useState("alert");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function handleCreate() {
    if (!scopeId) return;
    if (!dailyLimit && !monthlyLimit) return;
    setSaving(true);
    try {
      const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
      await fetch("/api/costs/budgets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({
          scope_type: scopeType,
          scope_id: scopeId,
          daily_limit_usd: dailyLimit ? parseFloat(dailyLimit) : null,
          monthly_limit_usd: monthlyLimit ? parseFloat(monthlyLimit) : null,
          alert_threshold_pct: parseInt(threshold) || 80,
          action_on_exceed: action,
        }),
      });
      onSaved();
    } catch { /* ignore */ }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    try {
      const csrf2 = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
      await fetch(`/api/costs/budgets?id=${id}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf2 } });
      onSaved();
    } catch { /* ignore */ }
    setDeleting(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <button onClick={onClose} className="absolute right-4 top-4 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition">
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">Budget Limits</h2>
        <p className="text-xs text-[var(--text-tertiary)] mb-5">Set daily or monthly spending caps per agent or tenant.</p>

        {/* Existing budgets */}
        {existingBudgets.length > 0 && (
          <div className="mb-5 space-y-2">
            <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-2">Active Budgets</h3>
            {existingBudgets.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5">
                <div>
                  <span className="text-sm font-medium text-[var(--text-primary)]">{b.scope_type}: {b.scope_id}</span>
                  <div className="flex gap-3 mt-0.5 text-xs text-[var(--text-tertiary)]">
                    {b.daily_limit_usd != null && <span>Daily: ${Number(b.daily_limit_usd).toFixed(2)}</span>}
                    {b.monthly_limit_usd != null && <span>Monthly: ${Number(b.monthly_limit_usd).toFixed(2)}</span>}
                    <span>Alert at {b.alert_threshold_pct}%</span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(b.id)}
                  disabled={deleting === b.id}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Create new budget */}
        <div className="space-y-3">
          <h3 className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">New Budget</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-tertiary)]">Scope Type</label>
              <select
                value={scopeType}
                onChange={e => { setScopeType(e.target.value as "agent" | "tenant"); setScopeId(""); }}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
              >
                <option value="agent">Agent</option>
                <option value="tenant">Tenant</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-tertiary)]">
                {scopeType === "agent" ? "Agent" : "Tenant ID"}
              </label>
              {scopeType === "agent" ? (
                <select
                  value={scopeId}
                  onChange={e => setScopeId(e.target.value)}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
                >
                  <option value="">Select agent...</option>
                  {agents.map(a => (
                    <option key={a.agent_id} value={a.agent_id}>{a.agent_name || a.agent_id}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={scopeId}
                  onChange={e => setScopeId(e.target.value)}
                  placeholder="e.g. transformate"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]/40"
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-tertiary)]">Daily Limit (USD)</label>
              <input
                type="number" step="0.01" min="0"
                value={dailyLimit}
                onChange={e => setDailyLimit(e.target.value)}
                placeholder="e.g. 5.00"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-tertiary)]">Monthly Limit (USD)</label>
              <input
                type="number" step="0.01" min="0"
                value={monthlyLimit}
                onChange={e => setMonthlyLimit(e.target.value)}
                placeholder="e.g. 50.00"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]/40"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-tertiary)]">Alert Threshold (%)</label>
              <input
                type="number" min="1" max="100"
                value={threshold}
                onChange={e => setThreshold(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-[var(--text-tertiary)]">On Exceed</label>
              <select
                value={action}
                onChange={e => setAction(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]/40"
              >
                <option value="alert">Alert Only</option>
                <option value="pause">Pause Agent</option>
                <option value="block">Block Requests</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={saving || !scopeId || (!dailyLimit && !monthlyLimit)}
            className="mt-1 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            {saving ? "Saving..." : "Create Budget Limit"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   PRICING TAB — agent→model linkage, model_pricing editor, infra costs
   ════════════════════════════════════════════════════════════ */

interface PricingRow {
  id: number;
  provider: string;
  model_id: string;
  display_name: string | null;
  pricing_type: "per_token" | "subscription" | "free";
  cost_per_1k_input: number | null;
  cost_per_1k_output: number | null;
  monthly_cost_usd: number | null;
  cached_input_discount_pct: number | null;
  is_free: boolean;
  notes: string | null;
  effective_from: string;
  effective_until: string | null;
}
interface AgentModelRow {
  id: string;
  name: string;
  tenant_id: string;
  tenant_name: string | null;
  default_provider: string | null;
  default_model_id: string | null;
  default_model_display_name: string | null;
  default_model_pricing_type: string | null;
  default_model_cost_per_1k_input: number | null;
  default_model_cost_per_1k_output: number | null;
  default_model_monthly_cost_usd: number | null;
}
interface InfraCostRow {
  id: number;
  name: string;
  category: string;
  monthly_cost_usd: number;
  currency: string;
  tenant_allocations: Record<string, number>;
  notes: string | null;
  active: boolean;
}

async function mutate(url: string, method: string, body?: unknown): Promise<Response> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
  return fetch(url, {
    method,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "x-csrf-token": csrf,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function PricingTab() {
  const [agents, setAgents] = useState<AgentModelRow[] | null>(null);
  const [pricing, setPricing] = useState<PricingRow[] | null>(null);
  const [infra, setInfra] = useState<InfraCostRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => setRefreshKey((k) => k + 1);

  const [newSub, setNewSub] = useState({ provider: "", model_id: "", display_name: "", monthly_cost_usd: "" });
  const [newInfra, setNewInfra] = useState({ name: "", category: "server", monthly_cost_usd: "", tenant_allocations: "{\"transformate\":1.0}", notes: "" });

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      apiFetch<{ agents: AgentModelRow[] }>("/api/admin/agents"),
      apiFetch<{ pricing: PricingRow[] }>("/api/admin/pricing"),
      apiFetch<{ infra_costs: InfraCostRow[] }>("/api/admin/infra-costs"),
    ])
      .then(([a, p, i]) => {
        if (cancelled) return;
        setAgents(a.agents);
        setPricing(p.pricing);
        setInfra(i.infra_costs);
      })
      .catch((e) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  async function setDefaultModel(agentId: string, providerModel: string) {
    setBusy(`agent:${agentId}`);
    try {
      const [default_provider, default_model_id] = providerModel ? providerModel.split("|") : [null, null];
      const res = await mutate("/api/admin/agents", "PATCH", {
        id: agentId,
        action: "set_default_model",
        default_provider,
        default_model_id,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${res.status}`);
      }
      refresh();
    } catch (e) {
      setError(`set_default_model: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  }

  async function syncOpenRouter() {
    setBusy("sync");
    try {
      const res = await mutate("/api/admin/pricing/sync", "POST");
      if (!res.ok) throw new Error(`${res.status}`);
      refresh();
    } catch (e) {
      setError(`sync: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  }

  async function createSubscription() {
    if (!newSub.provider || !newSub.model_id || !newSub.monthly_cost_usd) return;
    setBusy("sub");
    try {
      const res = await mutate("/api/admin/pricing", "POST", {
        provider: newSub.provider.trim(),
        model_id: newSub.model_id.trim(),
        display_name: newSub.display_name.trim() || newSub.model_id.trim(),
        pricing_type: "subscription",
        monthly_cost_usd: parseFloat(newSub.monthly_cost_usd),
        is_free: false,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${res.status}`);
      }
      setNewSub({ provider: "", model_id: "", display_name: "", monthly_cost_usd: "" });
      refresh();
    } catch (e) {
      setError(`createSub: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  }

  async function createInfra() {
    if (!newInfra.name || !newInfra.monthly_cost_usd) return;
    setBusy("infra");
    try {
      let allocations: Record<string, number>;
      try { allocations = JSON.parse(newInfra.tenant_allocations); } catch { throw new Error("tenant_allocations must be valid JSON"); }
      const res = await mutate("/api/admin/infra-costs", "POST", {
        name: newInfra.name.trim(),
        category: newInfra.category,
        monthly_cost_usd: parseFloat(newInfra.monthly_cost_usd),
        tenant_allocations: allocations,
        notes: newInfra.notes.trim() || null,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${res.status}`);
      }
      setNewInfra({ name: "", category: "server", monthly_cost_usd: "", tenant_allocations: "{\"transformate\":1.0}", notes: "" });
      refresh();
    } catch (e) {
      setError(`createInfra: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  }

  async function deleteInfra(id: number) {
    if (!confirm("Delete this infrastructure cost?")) return;
    setBusy(`infra:${id}`);
    try {
      const res = await mutate(`/api/admin/infra-costs?id=${id}`, "DELETE");
      if (!res.ok) throw new Error(`${res.status}`);
      refresh();
    } catch (e) {
      setError(`deleteInfra: ${e instanceof Error ? e.message : e}`);
    }
    setBusy(null);
  }

  if (loading && !agents) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
      </div>
    );
  }

  // Build a sorted dropdown of pricing options grouped by type for agent→model picker
  const pricingOptions = (pricing || []).slice().sort((a, b) => {
    if (a.provider !== b.provider) return a.provider.localeCompare(b.provider);
    return a.model_id.localeCompare(b.model_id);
  });

  const totalInfra = (infra || []).reduce((s, r) => s + Number(r.monthly_cost_usd), 0);

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-[16px] border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400 flex justify-between items-start">
          <span className="whitespace-pre-wrap">{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-red-400 hover:text-red-300"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Agents → Default Model ── */}
      <section className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agents → Default Model</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Each agent is assigned a default model. The model's pricing row determines its runtime cost (per-token or monthly subscription).
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 text-left">Agent</th>
                <th className="py-2 text-left">Tenant</th>
                <th className="py-2 text-left">Default Model</th>
                <th className="py-2 text-right">Type</th>
                <th className="py-2 text-right">Rate / Subscription</th>
              </tr>
            </thead>
            <tbody>
              {(agents || []).map((a) => {
                const currentKey = a.default_provider && a.default_model_id ? `${a.default_provider}|${a.default_model_id}` : "";
                const rateLabel = a.default_model_pricing_type === "subscription"
                  ? `$${Number(a.default_model_monthly_cost_usd || 0).toFixed(2)}/mo`
                  : a.default_model_pricing_type === "per_token"
                    ? `$${Number(a.default_model_cost_per_1k_input || 0).toFixed(4)} / $${Number(a.default_model_cost_per_1k_output || 0).toFixed(4)} per 1k`
                    : a.default_model_pricing_type === "free"
                      ? "Free"
                      : "—";
                return (
                  <tr key={a.id} className="border-b border-[var(--border)]/40 hover:bg-white/[0.02]">
                    <td className="py-3 text-[var(--text-primary)]">
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-[var(--text-tertiary)] font-mono">{a.id}</div>
                    </td>
                    <td className="py-3 text-[var(--text-secondary)]">{a.tenant_name || a.tenant_id}</td>
                    <td className="py-3">
                      <select
                        value={currentKey}
                        onChange={(e) => setDefaultModel(a.id, e.target.value)}
                        disabled={busy === `agent:${a.id}`}
                        className="rounded-lg border border-[var(--border)] bg-[var(--bg-base)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none disabled:opacity-40"
                      >
                        <option value="">— none —</option>
                        {pricingOptions.map((p) => (
                          <option key={`${p.provider}|${p.model_id}|${p.id}`} value={`${p.provider}|${p.model_id}`}>
                            {p.provider} / {p.display_name || p.model_id} {p.pricing_type === "subscription" ? `(sub $${Number(p.monthly_cost_usd).toFixed(0)}/mo)` : p.pricing_type === "free" ? "(free)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 text-right text-xs text-[var(--text-secondary)]">{a.default_model_pricing_type || "—"}</td>
                    <td className="py-3 text-right font-mono text-xs text-[var(--text-primary)]">{rateLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Model Pricing ── */}
      <section className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Model Pricing</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              {(pricing || []).length} models. Subscriptions shown in bold.
            </p>
          </div>
          <button
            onClick={syncOpenRouter}
            disabled={busy === "sync"}
            className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:opacity-40"
          >
            {busy === "sync" ? "Syncing..." : "Sync OpenRouter"}
          </button>
        </div>

        {/* Add subscription form */}
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-5 rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-3">
          <input placeholder="provider" value={newSub.provider} onChange={(e) => setNewSub({ ...newSub, provider: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
          <input placeholder="model_id" value={newSub.model_id} onChange={(e) => setNewSub({ ...newSub, model_id: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
          <input placeholder="display name" value={newSub.display_name} onChange={(e) => setNewSub({ ...newSub, display_name: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
          <input placeholder="$/mo" value={newSub.monthly_cost_usd} onChange={(e) => setNewSub({ ...newSub, monthly_cost_usd: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
          <button onClick={createSubscription} disabled={busy === "sub"} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-40">
            <Plus className="inline h-3 w-3" /> Add Subscription
          </button>
        </div>

        <div className="mt-4 max-h-[400px] overflow-auto">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-[var(--bg-surface)] text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 text-left">Provider</th>
                <th className="py-2 text-left">Model</th>
                <th className="py-2 text-left">Type</th>
                <th className="py-2 text-right">In $/1k</th>
                <th className="py-2 text-right">Out $/1k</th>
                <th className="py-2 text-right">$/mo</th>
              </tr>
            </thead>
            <tbody>
              {pricingOptions.map((p) => (
                <tr key={p.id} className={`border-b border-[var(--border)]/40 ${p.pricing_type === "subscription" ? "font-semibold" : ""}`}>
                  <td className="py-1.5 text-[var(--text-secondary)]">{p.provider}</td>
                  <td className="py-1.5 text-[var(--text-primary)]">{p.display_name || p.model_id}</td>
                  <td className="py-1.5 text-[var(--text-secondary)]">{p.pricing_type}</td>
                  <td className="py-1.5 text-right font-mono text-[var(--text-primary)]">{p.cost_per_1k_input != null ? Number(p.cost_per_1k_input).toFixed(5) : "—"}</td>
                  <td className="py-1.5 text-right font-mono text-[var(--text-primary)]">{p.cost_per_1k_output != null ? Number(p.cost_per_1k_output).toFixed(5) : "—"}</td>
                  <td className="py-1.5 text-right font-mono text-[var(--text-primary)]">{p.monthly_cost_usd != null ? `$${Number(p.monthly_cost_usd).toFixed(2)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Infrastructure Costs ── */}
      <section className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Infrastructure Costs</h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Servers & services. Total: <span className="font-mono text-[var(--text-primary)]">${totalInfra.toFixed(2)}/mo</span>
            </p>
          </div>
        </div>

        {/* Add infra form */}
        <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-6 rounded-xl border border-[var(--border)] bg-[var(--bg-base)] p-3">
          <input placeholder="name" value={newInfra.name} onChange={(e) => setNewInfra({ ...newInfra, name: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs md:col-span-2" />
          <select value={newInfra.category} onChange={(e) => setNewInfra({ ...newInfra, category: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs">
            <option value="server">server</option>
            <option value="service">service</option>
            <option value="api_subscription">api_subscription</option>
          </select>
          <input placeholder="$/mo" value={newInfra.monthly_cost_usd} onChange={(e) => setNewInfra({ ...newInfra, monthly_cost_usd: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs" />
          <input placeholder='{"transformate":1.0}' value={newInfra.tenant_allocations} onChange={(e) => setNewInfra({ ...newInfra, tenant_allocations: e.target.value })} className="rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1.5 text-xs font-mono" />
          <button onClick={createInfra} disabled={busy === "infra"} className="rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)] disabled:opacity-40">
            <Plus className="inline h-3 w-3" /> Add
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
              <tr className="border-b border-[var(--border)]">
                <th className="py-2 text-left">Name</th>
                <th className="py-2 text-left">Category</th>
                <th className="py-2 text-right">$/mo</th>
                <th className="py-2 text-left">Allocation</th>
                <th className="py-2 text-right"></th>
              </tr>
            </thead>
            <tbody>
              {(infra || []).map((i) => (
                <tr key={i.id} className="border-b border-[var(--border)]/40 hover:bg-white/[0.02]">
                  <td className="py-2 text-[var(--text-primary)]">
                    {i.name}
                    {i.notes && <div className="text-xs text-[var(--text-tertiary)]">{i.notes}</div>}
                  </td>
                  <td className="py-2 text-[var(--text-secondary)] text-xs">{i.category}</td>
                  <td className="py-2 text-right font-mono text-[var(--text-primary)]">${Number(i.monthly_cost_usd).toFixed(2)}</td>
                  <td className="py-2 text-xs font-mono text-[var(--text-secondary)]">
                    {Object.entries(i.tenant_allocations || {}).map(([k, v]) => `${k}:${(Number(v) * 100).toFixed(0)}%`).join(" ")}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      onClick={() => deleteInfra(i.id)}
                      disabled={busy === `infra:${i.id}`}
                      className="text-red-400 hover:text-red-300 disabled:opacity-40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
