"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { CostsEmpty } from "./empty-states";
import { SectionDescription } from "./dashboard-clarity";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";

/* ── colour tokens (matches existing charts.tsx palette) ── */
const C = {
  green: "#00D47E", secondary: "#64748b", amber: "#f59e0b",
  red: "#ef4444", slate: "#64748b", teal: "#14b8a6",
  pink: "#ec4899", blue: "#3b82f6",
  grid: "#1a2a4a", tooltipBg: "#0d0d1a",
};
const AGENT_COLORS = [C.green, C.secondary, C.amber, C.teal, C.pink, C.blue, C.red, C.slate];

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
      className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-5 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#475569]">{label}</p>
      <p className="mt-1.5 text-2xl font-bold" style={{ color }}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[#64748b]">{sub}</p>}
    </motion.div>
  );
}

/* (BudgetBar replaced by BudgetProgress in OverviewTab) */

/* ── range selector ── */
function RangeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex gap-1 rounded-xl bg-[#0d0d1a] p-1">
      {["24h", "7d", "30d"].map((r) => (
        <button key={r} onClick={() => onChange(r)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            value === r ? "bg-[#1a2a4a] text-white" : "text-[#475569] hover:text-[#94a3b8]"
          }`}>{r}</button>
      ))}
    </div>
  );
}

/* ── custom tooltip ── */
function CostTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-xs shadow-xl">
      <p className="text-[#64748b] mb-1">{label}</p>
      <p className="text-white font-medium">{fmt$(payload[0].value)}</p>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function CostsScreen() {
  const [range, setRange] = useState("30d");
  const [tab, setTab] = useState<"overview" | "agents" | "models">("overview");
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [agentData, setAgentData] = useState<AgentDetailRow[] | null>(null);
  const [modelData, setModelData] = useState<ModelRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [range, tab]);

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
          <h1 className="text-2xl font-bold tracking-tight text-[#e2e8f0]">Cost Tracker</h1>
          <p className="mt-1 text-sm text-[#64748b]">AI spend across all agents and models</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportCostCSV}
            disabled={!overview || !agentData}
            className="rounded-xl border border-[#1a2a4a] px-3 py-1.5 text-xs font-medium text-[#64748b] hover:text-white hover:border-[#2a3a5a] transition disabled:opacity-30 disabled:cursor-not-allowed"
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
      <div className="flex gap-2">
        {(["overview", "agents", "models"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-[rgba(0,212,126,0.15)] text-[#00D47E]" : "text-[#64748b] hover:text-[#e2e8f0]"
            }`}>{t === "overview" ? "Overview" : t === "agents" ? "By Agent" : "By Model"}</button>
        ))}
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00D47E] border-t-transparent" />
        </div>
      ) : tab === "overview" ? (
        <OverviewTab overview={overview} dailyBurn={dailyBurn} projected={projected} agentData={agentData} />
      ) : tab === "agents" ? (
        <AgentsTab agents={agentData} loading={loading} anomalies={overview?.agent_anomalies || []} />
      ) : (
        <ModelsTab models={modelData} loading={loading} />
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
        <span className="text-[#94a3b8] font-medium">{label}</span>
        <span className="text-[#64748b]">
          {fmt$(spent)} / {fmt$(limit)}
          <span className="ml-1.5 font-medium" style={{ color: barColor }}>({Math.round(pct)}%)</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-[#1a2a4a] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, backgroundColor: barColor }} />
        {/* Threshold marker */}
        <div className="absolute top-0 h-full w-px bg-[#475569]" style={{ left: `${threshold}%` }} />
      </div>
      {projectionText && (
        <p className="text-[10px] mt-1" style={{ color: pct >= threshold ? C.amber : "#475569" }}>{projectionText}</p>
      )}
    </div>
  );
}

/* ═══ Cost Anomaly Alert ═══ */
function AnomalyAlert({ anomalies }: { anomalies: AgentAnomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <div className="rounded-[16px] border border-[#f59e0b]/30 bg-[#f59e0b]/5 p-4">
      <h3 className="text-sm font-medium text-[#f59e0b] mb-2">Spending Anomalies Detected</h3>
      <div className="space-y-2">
        {anomalies.map((a) => (
          <div key={a.agent_id} className="flex items-center justify-between text-xs">
            <span className="text-[#e2e8f0]">
              <span className="font-medium">{a.agent_name}</span>
              <span className="text-[#f59e0b] ml-2">{a.ratio.toFixed(1)}x higher than 7-day average</span>
            </span>
            <span className="text-[#64748b]">
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
  const [expanded, setExpanded] = useState(false);
  const tips: Array<{ text: string; savings?: string; color: string }> = [];

  // Tip: high error rate agents wasting tokens
  if (agentData) {
    for (const a of agentData) {
      if (a.total_messages > 0) {
        // Use daily_trend to estimate error cost
        const costPerMsg = a.total_cost / Math.max(a.total_messages, 1);
        if (costPerMsg > 0.1 && a.total_cost > 1) {
          tips.push({
            text: `${a.agent_name || a.agent_id} has high cost per message (${fmt$(costPerMsg)}). Check for retries or excessive tool calls.`,
            color: C.amber,
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
      });
    }
  }

  // Tip: no budget set
  if (overview.budgets.length === 0 && overview.summary.total_cost_usd > 0) {
    tips.push({
      text: "No budget limits configured. Set a monthly budget to prevent overspending.",
      color: C.secondary,
    });
  }

  // Tip: budget nearly exceeded
  for (const b of overview.budgets) {
    if (b.monthly_limit_usd && b.month_spend / b.monthly_limit_usd > 0.8) {
      tips.push({
        text: `Budget for ${b.scope_type}:${b.scope_id} is at ${Math.round((b.month_spend / b.monthly_limit_usd) * 100)}%. Consider reviewing high-cost agents.`,
        color: C.red,
      });
    }
  }

  if (tips.length === 0) return null;

  return (
    <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-5">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center justify-between w-full text-left">
        <h3 className="text-sm font-medium text-[#94a3b8]">
          Optimization Tips
          <span className="ml-2 text-xs text-[#475569]">({tips.length})</span>
        </h3>
        <span className="text-xs text-[#475569]">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {tips.map((tip, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className="shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tip.color }} />
              <span className="text-[#94a3b8]">{tip.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ═══ Overview Tab ═══ */
function OverviewTab({ overview, dailyBurn, projected, agentData }: {
  overview: OverviewData | null; dailyBurn: number; projected: number; agentData: AgentDetailRow[] | null;
}) {
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
        <StatCard label="Total Tokens" value={fmtK(summary.total_tokens)} color={C.secondary} />
        <StatCard label="Active Agents" value={String(summary.active_agents)} color={C.teal} />
      </div>

      {/* Anomaly alerts */}
      <AnomalyAlert anomalies={agent_anomalies} />

      {/* Budget progress (enhanced) */}
      {budgets.length > 0 && (
        <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-5">
          <h3 className="text-sm font-medium text-[#94a3b8] mb-4">Budget Status</h3>
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
        <div className="rounded-[16px] border border-dashed border-[#1a2a4a] bg-[#0d0d1a]/50 p-4 text-center">
          <p className="text-sm text-[#64748b]">No budget limits configured.</p>
          <p className="text-xs text-[#475569] mt-1">Set a budget to track spending against a target and get alerts.</p>
        </div>
      )}

      {/* Cost trend chart */}
      <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-5">
        <h3 className="text-sm font-medium text-[#94a3b8] mb-4">Daily Cost Trend</h3>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={daily_trend}>
            <defs>
              <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={C.green} stopOpacity={0.3} />
                <stop offset="100%" stopColor={C.green} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="day" tick={{ fill: "#475569", fontSize: 11 }}
              tickFormatter={(v: string) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })} />
            <YAxis tick={{ fill: "#475569", fontSize: 11 }} tickFormatter={(v: number) => fmt$(v)} />
            <Tooltip content={<CostTooltip />} />
            <Area type="monotone" dataKey="cost" stroke={C.green} fill="url(#costGrad)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top agents by cost */}
        <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-5">
          <h3 className="text-sm font-medium text-[#94a3b8] mb-4">Top Agents by Cost</h3>
          {by_agent.length === 0 ? (
            <CostsEmpty />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={by_agent.slice(0, 6)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" tick={{ fill: "#475569", fontSize: 11 }} tickFormatter={(v: number) => fmt$(v)} />
                <YAxis type="category" dataKey="agent_name" tick={{ fill: "#94a3b8", fontSize: 11 }} width={100} />
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
        <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-5">
          <h3 className="text-sm font-medium text-[#94a3b8] mb-4">Tenant Spend</h3>
          {by_tenant.map((t) => (
            <div key={t.tenant_id} className="flex items-center justify-between py-2 border-b border-[#1a2a4a]/50 last:border-0">
              <span className="text-sm text-[#e2e8f0]">{t.tenant_id}</span>
              <div className="text-right">
                <span className="text-sm font-medium text-white">{fmt$(t.cost)}</span>
                <span className="text-xs text-[#475569] ml-2">{fmtK(t.tokens)} tokens</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimization Tips */}
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00D47E] border-t-transparent" />
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
          className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] p-4"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-white">{a.agent_name || a.agent_id}</h4>
                {anomalyMap[a.agent_id] && (
                  <span className="inline-flex items-center rounded-full bg-[#f59e0b]/15 px-2 py-0.5 text-[10px] font-semibold text-[#f59e0b]">
                    {anomalyMap[a.agent_id].ratio.toFixed(1)}x avg
                  </span>
                )}
              </div>
              <p className="text-xs text-[#475569]">{a.tenant_id} · {a.active_days}d active</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-semibold" style={{ color: AGENT_COLORS[i % AGENT_COLORS.length] }}>
                {fmt$(a.total_cost)}
              </p>
              <p className="text-xs text-[#475569]">{fmtK(a.total_tokens)} tokens</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
            <div><span className="text-[#475569]">Messages</span><p className="text-[#94a3b8]">{a.total_messages}</p></div>
            <div><span className="text-[#475569]">Tool Calls</span><p className="text-[#94a3b8]">{a.total_tool_calls}</p></div>
            <div><span className="text-[#475569]">$/1K tokens</span><p className="text-[#94a3b8]">{fmt$(a.cost_per_1k_tokens)}</p></div>
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#00D47E] border-t-transparent" />
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
          <h3 className="text-sm font-medium text-[#94a3b8] mb-3">Paid Models</h3>
          <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a2a4a] text-[#475569] text-xs">
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">Provider</th>
                  <th className="text-right p-3 font-medium">Events</th>
                  <th className="text-right p-3 font-medium">Tokens</th>
                  <th className="text-right p-3 font-medium">Est. Cost</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((m) => (
                  <tr key={`${m.provider}::${m.model}`} className="border-b border-[#1a2a4a]/50 last:border-0">
                    <td className="p-3 text-white">{m.display_name}</td>
                    <td className="p-3 text-[#64748b]">{m.provider}</td>
                    <td className="p-3 text-right text-[#94a3b8]">{m.event_count}</td>
                    <td className="p-3 text-right text-[#94a3b8]">{fmtK(m.total_tokens)}</td>
                    <td className="p-3 text-right font-medium text-[#f59e0b]">{fmt$(m.estimated_cost)}</td>
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
          <h3 className="text-sm font-medium text-[#94a3b8] mb-3">Free / Local Models</h3>
          <div className="rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1a2a4a] text-[#475569] text-xs">
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-left p-3 font-medium">Provider</th>
                  <th className="text-right p-3 font-medium">Events</th>
                  <th className="text-right p-3 font-medium">Tokens</th>
                  <th className="text-right p-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {free.map((m) => (
                  <tr key={`${m.provider}::${m.model}`} className="border-b border-[#1a2a4a]/50 last:border-0">
                    <td className="p-3 text-white">{m.display_name}</td>
                    <td className="p-3 text-[#64748b]">{m.provider}</td>
                    <td className="p-3 text-right text-[#94a3b8]">{m.event_count}</td>
                    <td className="p-3 text-right text-[#94a3b8]">{fmtK(m.total_tokens)}</td>
                    <td className="p-3 text-right text-[#00D47E]">Free</td>
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
