"use client";

import React, { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";

/* ── colour tokens (matches existing charts.tsx palette) ── */
const C = {
  green: "#06d6a0", purple: "#8b5cf6", amber: "#f59e0b",
  red: "#ef4444", slate: "#64748b", teal: "#14b8a6",
  pink: "#ec4899", blue: "#3b82f6",
  grid: "#1a2a4a", tooltipBg: "#0d0d1a",
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
interface OverviewData {
  summary: CostSummary;
  daily_trend: DailyTrend[];
  by_agent: AgentCost[];
  by_tenant: TenantCost[];
  budgets: BudgetRow[];
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

/* ── budget bar ── */
function BudgetBar({ label, spent, limit, threshold }: {
  label: string; spent: number; limit: number; threshold: number;
}) {
  const pct = pctOf(spent, limit);
  const barColor = pct >= 100 ? C.red : pct >= threshold ? C.amber : C.green;
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-[#64748b] mb-1">
        <span>{label}</span>
        <span>{fmt$(spent)} / {fmt$(limit)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1a2a4a] overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
    </div>
  );
}

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

    if (tab === "agents") {
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[#e2e8f0]">Cost Tracker</h1>
          <p className="mt-1 text-sm text-[#64748b]">AI spend across all agents and models</p>
        </div>
        <RangeSelector value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-[16px] border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-400">{error}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        {(["overview", "agents", "models"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-[rgba(6,214,160,0.15)] text-[#06d6a0]" : "text-[#64748b] hover:text-[#e2e8f0]"
            }`}>{t === "overview" ? "Overview" : t === "agents" ? "By Agent" : "By Model"}</button>
        ))}
      </div>

      {loading && !overview ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8b5cf6] border-t-transparent" />
        </div>
      ) : tab === "overview" ? (
        <OverviewTab overview={overview} dailyBurn={dailyBurn} projected={projected} />
      ) : tab === "agents" ? (
        <AgentsTab agents={agentData} loading={loading} />
      ) : (
        <ModelsTab models={modelData} loading={loading} />
      )}
    </div>
  );
}

/* ═══ Overview Tab ═══ */
function OverviewTab({ overview, dailyBurn, projected }: {
  overview: OverviewData | null; dailyBurn: number; projected: number;
}) {
  if (!overview) return null;
  const { summary, daily_trend, by_agent, by_tenant, budgets } = overview;

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={`Total Spend (${summary.range})`} value={fmt$(summary.total_cost_usd)} color={C.green} />
        <StatCard label="Daily Burn (7d avg)" value={fmt$(dailyBurn)} sub={`~${fmt$(projected)}/mo projected`} color={C.amber} />
        <StatCard label="Total Tokens" value={fmtK(summary.total_tokens)} color={C.purple} />
        <StatCard label="Active Agents" value={String(summary.active_agents)} color={C.teal} />
      </div>

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
            <p className="text-sm text-[#475569]">No cost data yet</p>
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

        {/* Tenant breakdown + budgets */}
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

          {budgets.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-[#94a3b8] mt-5 mb-3">Budget Status</h3>
              {budgets.map((b) => (
                <React.Fragment key={b.id}>
                  {b.daily_limit_usd && (
                    <BudgetBar
                      label={`${b.scope_type}:${b.scope_id} (daily)`}
                      spent={b.today_spend}
                      limit={b.daily_limit_usd}
                      threshold={b.alert_threshold_pct}
                    />
                  )}
                  {b.monthly_limit_usd && (
                    <BudgetBar
                      label={`${b.scope_type}:${b.scope_id} (monthly)`}
                      spent={b.month_spend}
                      limit={b.monthly_limit_usd}
                      threshold={b.alert_threshold_pct}
                    />
                  )}
                </React.Fragment>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ Agents Tab ═══ */
function AgentsTab({ agents, loading }: { agents: AgentDetailRow[] | null; loading: boolean }) {
  if (loading || !agents) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8b5cf6] border-t-transparent" />
      </div>
    );
  }

  if (agents.length === 0) {
    return <p className="text-center text-sm text-[#475569] py-12">No agent cost data yet</p>;
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
              <h4 className="text-sm font-medium text-white">{a.agent_name || a.agent_id}</h4>
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
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8b5cf6] border-t-transparent" />
      </div>
    );
  }

  if (models.length === 0) {
    return <p className="text-center text-sm text-[#475569] py-12">No model usage data yet</p>;
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
                    <td className="p-3 text-right text-[#06d6a0]">Free</td>
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
