"use client";

import React, { useState, useMemo } from "react";
import { CostsEmpty } from "./empty-states";
import {
  AreaChart, Area, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Plus, Trash2, X, TrendingUp, ArrowRight, Info } from "lucide-react";
import { Button, Card, PageHeader, SectionTitle, StatusPill, Tabs } from "./ui-cards";
import { Sparkline } from "./charts";
import { Avatar } from "./agents-kit";
import { cn } from "@/lib/utils";

// Brand bible §5.1: Void/S1/S2 surfaces + Quarn Emerald single brand color
// (one job per section) + semantic locked (warning amber / danger red).
// No cyan/pink/blue/purple — they are reserved for non-Arkon palettes.
const C = {
  emerald: "var(--quarn)",      // Quarn Emerald — brand
  emeraldLight: "var(--quarn-light)", // Quarn Light — secondary brand series, healthy
  emeraldDeep: "var(--quarn-deep)",  // Quarn Deep — gradient anchor
  amber: "var(--warning)",        // semantic warning
  red: "var(--danger)",          // semantic danger (kill only)
  slate: "var(--fg-2)",        // text-secondary tone
  teal: "#14b8a6",         // info adjunct (sparingly)
  grid: "var(--border)",
  tooltipBg: "var(--surface-1)",
};

// Persona palette LOCKED (brand bible §3.6 + Brynn's brief):
// warden=emerald · codesmith=slate · lumina=amber · sentinel=teal.
// Fallback for unknown agents → slate. Used for per-row sparkline color.
function personaColor(slug: string | undefined): string {
  switch ((slug || "").toLowerCase()) {
    case "warden":    return C.emerald;
    case "codesmith": return C.slate;
    case "lumina":    return C.amber;
    case "sentinel":  return C.teal;
    default:          return C.slate;
  }
}

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

/* ── soft fetch — used for admin-scoped supplementary data (model assignments,
   pricing catalog, infra costs). On 401/403 returns null so non-admin viewers
   see Rule-12 telemetry-pending instead of being redirected to /login. ── */
async function softFetch<T>(url: string): Promise<T | null> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-csrf-token": csrf },
  });
  if (res.status === 401 || res.status === 403) return null;
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── ProgressBar — slim horizontal fill bar. Canonical "Progress" component. ── */
function ProgressBar({
  value, max, color = C.emerald, thresholdPct,
}: {
  value: number;
  max: number;
  color?: string;
  thresholdPct?: number; // optional dashed marker (0-100)
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
      <div
        className="h-full rounded-full transition-all duration-500"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
      {thresholdPct != null && thresholdPct > 0 && thresholdPct < 100 && (
        <div
          aria-hidden="true"
          className="absolute top-0 h-full w-px bg-[var(--text-tertiary)]/60"
          style={{ left: `${thresholdPct}%` }}
        />
      )}
    </div>
  );
}

/* ── Tag — tiny inline chip (canonical <Tag>{scope}</Tag>) ── */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-surface-2)] px-1.5 py-0.5 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-secondary)]">
      {children}
    </span>
  );
}

/* ── CeilingCard — canonical 2-up hero card.
   Avatar + agent label + Tag(scope) + StatusPill (right) — KPI cluster — progress bar
   — uppercase tracking-wider footer: PROJECTED · $X / BREACH · NEVER AT THIS RATE.
   28px KPI (hero surface, canonical line 43). ── */
function CeilingCard({
  scopeType, agentSlug, agentName, scope, used, limit, projected, threshold,
}: {
  scopeType: "agent" | "tenant"; // budget_limits.scope_type — drives the slug-prefix label
  agentSlug: string;             // for scope_type="tenant" this is the tenant ID, not an agent
  agentName: string;
  scope: "daily" | "monthly";
  used: number;
  limit: number;        // 0 → telemetry-pending
  projected?: number;
  threshold?: number;   // alert pct (0-100)
}) {
  const hasLimit = limit > 0;
  const pct = hasLimit ? (used / limit) * 100 : 0;
  const alertPct = threshold ?? 80;
  const isOver = hasLimit && pct >= 100;
  const isWarn = hasLimit && !isOver && pct >= alertPct;

  // StatusPill tone names — see ui-cards Tone union: live/warm/idle/err/info/ok/neutral.
  // Map: over → err, near-limit → warm, healthy → ok, no-limit → idle.
  const pillTone: "ok" | "warm" | "err" | "idle" = !hasLimit ? "idle" : isOver ? "err" : isWarn ? "warm" : "ok";
  const pillLabel = !hasLimit ? "No ceiling" : isOver ? "Over" : isWarn ? "Near limit" : "On track";
  const accent = isOver ? C.red : isWarn ? C.amber : C.emerald;

  // Breach forecast text. If projected exceeds limit, surface the date; otherwise
  // "never at this rate" (canonical line 52).
  let breachText = "Never at this rate";
  if (hasLimit && projected != null && projected > limit) {
    breachText = "Breach forecast";
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
      <div className="mb-4 flex items-center gap-2">
        <Avatar name={agentName} persona={scopeType === "agent" ? agentSlug : undefined} size="sm" />
        <span className="font-mono text-[13px] font-medium text-[var(--text-primary)]">{scopeType}:{agentSlug}</span>
        <Tag>{scope}</Tag>
        <span className="ml-auto"><StatusPill status={pillTone}>{pillLabel}</StatusPill></span>
      </div>

      <div className="mb-3 flex items-baseline gap-3">
        <span
          className="font-mono text-[28px] font-medium leading-none tracking-normal"
          style={{ color: hasLimit ? "var(--text-primary)" : "var(--text-tertiary)" }}
        >
          {hasLimit ? fmt$(used) : "—"}
        </span>
        {hasLimit && (
          <span className="font-mono text-sm text-[var(--text-tertiary)]">/ {fmt$(limit)}</span>
        )}
        <span
          className="ml-auto font-mono text-[13px]"
          style={{ color: hasLimit ? accent : "var(--text-tertiary)" }}
        >
          {hasLimit ? `${pct.toFixed(1)}%` : "telemetry pending"}
        </span>
      </div>

      <ProgressBar value={used} max={Math.max(limit, 1)} color={accent} thresholdPct={hasLimit ? alertPct : undefined} />

      <div className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        <span>Projected · {hasLimit && projected != null ? fmt$(projected) : "—"}</span>
        <span>Breach · {hasLimit ? breachText : "no ceiling"}</span>
      </div>
    </div>
  );
}

/* ── range selector ── */
function RangeSelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Tabs
      active={value}
      onChange={onChange}
      items={["24h", "7d", "30d"].map((r) => ({ id: r, label: r }))}
    />
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
  // Dialog state lifted from OverviewTab so the canonical "+ New ceiling" CTA
  // in the page header can open it regardless of which tab is active.
  const [showNewCeiling, setShowNewCeiling] = useState(false);
  // Admin-scoped supplementary data for the canonical Overview tab. Fetched via
  // softFetch so non-admin viewers fall through to Rule-12 telemetry-pending
  // instead of being bounced to /login.
  const [adminAgents, setAdminAgents] = useState<AgentModelRow[] | null>(null);
  const [pricing, setPricing] = useState<PricingRow[] | null>(null);
  const [infraCosts, setInfraCosts] = useState<InfraCostRow[] | null>(null);
  const refresh = () => setRefreshKey(k => k + 1);

  // Fetch the admin/pricing/infra supplements alongside the overview. These
  // change rarely; refresh on the same key as the rest.
  React.useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      softFetch<{ agents: AgentModelRow[] }>("/api/admin/agents"),
      softFetch<{ pricing: PricingRow[] }>("/api/admin/pricing"),
      softFetch<{ infra_costs: InfraCostRow[] }>("/api/admin/infra-costs"),
    ]).then(([a, p, i]) => {
      if (cancelled) return;
      if (a.status === "fulfilled" && a.value) setAdminAgents(a.value.agents);
      if (p.status === "fulfilled" && p.value) setPricing(p.value.pricing);
      if (i.status === "fulfilled" && i.value) setInfraCosts(i.value.infra_costs);
    });
    return () => { cancelled = true; };
  }, [refreshKey]);

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
      {/* Canonical header — title + one-sentence subtitle; "+ New ceiling" is
          the single primary action. Crumbs (Arkon › Govern › Cost ceilings)
          are owned by the top bar per WI-391 — do NOT pass crumbs here. */}
      <PageHeader
        title="Cost ceilings"
        subtitle="Cap, monitor, and recommend. Every agent has a daily and a monthly limit you set."
        live
        updated="now"
        action={
          <div className="flex flex-wrap items-center gap-2">
            <RangeSelector value={range} onChange={setRange} />
            <Button
              onClick={exportCostCSV}
              disabled={!overview || !agentData}
              kind="secondary"
            >
              Export CSV
            </Button>
            <Button onClick={() => setShowNewCeiling(true)} kind="primary">
              <Plus className="h-3.5 w-3.5" /> New ceiling
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-[16px] border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]">{error}</div>
      )}

      {/* Tabs */}
      <Tabs
        active={tab}
        onChange={setTab}
        items={[
          { id: "overview", label: "Overview" },
          { id: "agents", label: "By Agent" },
          { id: "models", label: "By Model" },
          { id: "pricing", label: "Pricing" },
        ]}
      />

      {loading && !overview ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        </div>
      ) : tab === "overview" ? (
        <OverviewTab
          overview={overview}
          dailyBurn={dailyBurn}
          projected={projected}
          agentData={agentData}
          adminAgents={adminAgents}
          pricing={pricing}
          infraCosts={infraCosts}
          onOpenNewCeiling={() => setShowNewCeiling(true)}
        />
      ) : tab === "agents" ? (
        <AgentsTab agents={agentData} loading={loading} anomalies={overview?.agent_anomalies || []} />
      ) : tab === "models" ? (
        <ModelsTab models={modelData} loading={loading} />
      ) : (
        <PricingTab />
      )}

      {/* Page-level "+ New ceiling" dialog — lifted from OverviewTab so the
          header CTA can open it from any tab. */}
      {showNewCeiling && overview && (
        <BudgetDialog
          agents={overview.by_agent}
          existingBudgets={overview.budgets}
          onClose={() => setShowNewCeiling(false)}
          onSaved={() => { setShowNewCeiling(false); refresh(); }}
        />
      )}
    </div>
  );
}

/* ═══ Overview Tab ═══
   Canonical layout (brand-package/screens/costs.jsx):
     - Ceilings hero — 2-up card grid (one card per (budget × scope-with-limit)).
     - Main column (left) + Sidebar (right, 320px sticky):
       * Main: Daily spend Card (4-stat strip + chart-mode Tabs + area chart
         with dashed CEILING reference line) → Anomalies Card with Inspect →
         By-agent table Card with Avatar + Model + Tokens + Cost + Share bar + %.
       * Sidebar: Recommendations Card + Pricing Card (subscriptions + infra
         totals + Open pricing detail action). */
function OverviewTab({
  overview, dailyBurn, projected, agentData, adminAgents, pricing, infraCosts, onOpenNewCeiling,
}: {
  overview: OverviewData | null;
  dailyBurn: number;
  projected: number;
  agentData: AgentDetailRow[] | null;
  adminAgents: AgentModelRow[] | null;
  pricing: PricingRow[] | null;
  infraCosts: InfraCostRow[] | null;
  onOpenNewCeiling: () => void;
}) {
  // useMemo must be called unconditionally (hooks ordering rule). Compute
  // before any early return.
  const modelByAgent = useMemo(() => {
    const m: Record<string, string> = {};
    if (adminAgents) {
      for (const a of adminAgents) {
        if (a.default_model_display_name) m[a.id] = a.default_model_display_name;
        else if (a.default_model_id) m[a.id] = a.default_model_id;
      }
    }
    return m;
  }, [adminAgents]);

  // Chart-mode state: canonical Daily-spend Tabs (By total / By agent / By model).
  // Only "total" is wired; the others render a telemetry-pending placeholder
  // until a per-agent / per-model time-series is exposed via the overview
  // endpoint. Rule 12 fail-loud: do NOT fake a stacked chart with zeros.
  const [chartMode, setChartMode] = useState<"total" | "agent" | "model">("total");

  if (!overview) return null;
  const { summary, daily_trend, by_agent, budgets, last_month_cost, agent_anomalies } = overview;

  const monthDeltaPct = last_month_cost > 0 ? ((projected - last_month_cost) / last_month_cost) * 100 : null;

  // Pick the first set daily_limit as the chart's CEILING overlay. Multi-agent
  // stacking is deferred. Rule 12: show ONE overlay or none.
  const dailyCeiling = budgets
    .map((b) => b.daily_limit_usd)
    .filter((v): v is number => v != null)[0] ?? null;

  // Flatten budgets → one card per (budget, scope) where the limit is set.
  // Filter out 0-valued limits at construction: a limit of 0 is degenerate
  // ("block all spend" semantics) and would NaN the on-track pct otherwise.
  // Per @claude PR-39 review: !=null lets 0 through; guard explicitly.
  type CeilingRow = {
    id: string; scopeType: "agent" | "tenant"; agentSlug: string; agentName: string;
    scope: "daily" | "monthly"; used: number; limit: number;
    projected?: number; threshold?: number;
  };
  const ceilingRows: CeilingRow[] = budgets.flatMap((b) => {
    const agentMatch = by_agent.find((x) => x.agent_id === b.scope_id);
    const agentName = agentMatch?.agent_name || b.scope_id;
    const scopeType: "agent" | "tenant" =
      b.scope_type === "tenant" ? "tenant" : "agent";
    const rows: CeilingRow[] = [];
    if (b.daily_limit_usd != null && b.daily_limit_usd > 0) {
      rows.push({
        id: `${b.id}-d`, scopeType, agentSlug: b.scope_id, agentName, scope: "daily",
        used: b.today_spend, limit: b.daily_limit_usd,
        projected: dailyBurn, threshold: b.alert_threshold_pct,
      });
    }
    if (b.monthly_limit_usd != null && b.monthly_limit_usd > 0) {
      const now = new Date();
      const daysLeftInMonth = Math.max(
        0,
        new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate()
      );
      rows.push({
        id: `${b.id}-m`, scopeType, agentSlug: b.scope_id, agentName, scope: "monthly",
        used: b.month_spend, limit: b.monthly_limit_usd,
        projected: b.month_spend + dailyBurn * daysLeftInMonth,
        threshold: b.alert_threshold_pct,
      });
    }
    return rows;
  });
  // limit>0 is guaranteed at row construction, so the division is safe here.
  const onTrackCount = ceilingRows.filter(
    (r) => (r.used / r.limit) * 100 < (r.threshold ?? 80)
  ).length;

  // By-agent sorted, top 10. Used for the table replacing the prior bar chart.
  const byAgentRows = [...by_agent].sort((a, b) => b.cost - a.cost).slice(0, 10);
  const totalByAgent = by_agent.reduce((s, a) => s + a.cost, 0);

  return (
    <div className="space-y-6">
      {/* Section 1 — Ceilings hero. Canonical 2-up grid (gridTemplateColumns: 1fr 1fr). */}
      <section aria-label="Active ceilings">
        <SectionTitle
          title="Ceilings"
          note={
            ceilingRows.length === 0
              ? "no ceilings set"
              : `${ceilingRows.length} active · ${onTrackCount === ceilingRows.length ? "all" : onTrackCount} on track`
          }
        />
        {ceilingRows.length === 0 ? (
          <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--bg-surface)]/40 px-4 py-6 text-center">
            <p className="text-sm text-[var(--text-secondary)]">No ceilings configured.</p>
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">
              Click <span className="text-[var(--text-primary)]">New ceiling</span> to cap an
              agent&apos;s daily or monthly spend.
            </p>
            <button
              type="button"
              onClick={onOpenNewCeiling}
              className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> New ceiling
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {ceilingRows.map((r) => (
              <CeilingCard
                key={r.id}
                scopeType={r.scopeType}
                agentSlug={r.agentSlug}
                agentName={r.agentName}
                scope={r.scope}
                used={r.used}
                limit={r.limit}
                projected={r.projected}
                threshold={r.threshold}
              />
            ))}
          </div>
        )}
      </section>

      {/* Main + sidebar grid (canonical line 61: '1fr 320px'). */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px] items-start">
        {/* ─── MAIN COLUMN ─── */}
        <div className="flex flex-col gap-4 min-w-0">
          {/* Daily spend Card — canonical 4-stat strip + chart-mode Tabs + chart. */}
          <Card title="Daily spend" meta={`${summary.range} · all agents`}>
            <div className="mb-4 flex flex-wrap items-baseline gap-6">
              <div>
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Total · {summary.range}
                </div>
                <div className="mt-1 font-mono text-[28px] font-medium leading-none tracking-normal text-[var(--text-primary)]">
                  {fmt$(summary.total_cost_usd)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Daily avg
                </div>
                <div className="mt-1 font-mono text-[18px] font-medium leading-none tracking-normal text-[var(--text-secondary)]">
                  {fmt$(dailyBurn)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  Projected · month
                </div>
                <div className="mt-1 font-mono text-[18px] font-medium leading-none tracking-normal text-[var(--text-secondary)]">
                  {fmt$(projected)}
                </div>
              </div>
              <div>
                <div className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  vs last month
                </div>
                <div
                  className="mt-1 font-mono text-[18px] font-medium leading-none tracking-normal"
                  style={{
                    color: monthDeltaPct == null
                      ? "var(--text-tertiary)"
                      : monthDeltaPct < 0 ? C.emerald : monthDeltaPct > 20 ? C.amber : "var(--text-secondary)",
                  }}
                >
                  {monthDeltaPct == null
                    ? "—"
                    : `${monthDeltaPct < 0 ? "↓" : "↑"} ${Math.abs(monthDeltaPct).toFixed(0)}%`}
                </div>
              </div>
              <div className="ml-auto">
                <Tabs
                  active={chartMode}
                  onChange={setChartMode}
                  items={[
                    { id: "total", label: "By total" },
                    { id: "agent", label: "By agent" },
                    { id: "model", label: "By model" },
                  ]}
                />
              </div>
            </div>

            {chartMode === "total" ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={daily_trend}>
                  <defs>
                    <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={C.emerald} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={C.emerald} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "var(--fg-3)", fontSize: 11 }}
                    tickFormatter={(v: string) => new Date(v).toLocaleDateString("en", { month: "short", day: "numeric" })}
                  />
                  <YAxis tick={{ fill: "var(--fg-3)", fontSize: 11 }} tickFormatter={(v: number) => fmt$(v)} />
                  <Tooltip content={<CostTooltip />} />
                  <Area type="monotone" dataKey="cost" stroke={C.emerald} fill="url(#costGrad)" strokeWidth={2} />
                  {dailyCeiling != null && (
                    <ReferenceLine
                      y={dailyCeiling}
                      stroke={C.amber}
                      strokeDasharray="4 4"
                      strokeWidth={1.5}
                      label={{
                        value: "CEILING",
                        fill: C.amber,
                        fontSize: 10,
                        position: "insideTopRight",
                      }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[240px] items-center justify-center rounded-lg border border-dashed border-[var(--border)] bg-[var(--bg-surface-2)]/40">
                <p className="text-xs text-[var(--text-tertiary)]">
                  By-{chartMode} breakdown preview — telemetry pending (per-{chartMode} time-series
                  not yet on /api/costs/overview)
                </p>
              </div>
            )}
          </Card>

          {/* Anomalies — canonical Card wrapper, inline rec rows, Inspect button per row. */}
          {agent_anomalies && agent_anomalies.length > 0 && (
            <Card title="Anomalies" meta="Last 7 days" flush>
              <ul className="divide-y divide-[var(--border)]/50">
                {agent_anomalies.map((a) => (
                  <li key={a.agent_id} className="flex items-start gap-3 px-5 py-3">
                    <span
                      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: "rgba(var(--warning-rgb), 0.102)", color: C.amber }}
                    >
                      <TrendingUp className="h-4 w-4" />
                    </span>
                    <p className="min-w-0 flex-1 text-sm text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">{a.agent_name || a.agent_id}</span>{" "}
                      burned <span className="font-mono text-[var(--text-primary)]">{fmt$(a.today_cost)}</span> today
                      {" · "}
                      <em className="not-italic text-[var(--text-tertiary)]">
                        {a.ratio.toFixed(1)}× higher than 7-day average ({fmt$(a.avg_7d)}/day)
                      </em>
                    </p>
                    <button
                      type="button"
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
                    >
                      Inspect <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* By agent — canonical table (Agent · Model · Tokens · Cost · Share · %). */}
          <Card
            title="By agent"
            meta={`${summary.range} · ${by_agent.length} agent${by_agent.length === 1 ? "" : "s"} · sorted by cost`}
            flush
          >
            {byAgentRows.length === 0 ? (
              <div className="px-5 py-5"><CostsEmpty /></div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-wider text-[var(--text-tertiary)]">
                    <th className="px-5 py-2.5 text-left font-medium">Agent</th>
                    <th className="px-3 py-2.5 text-left font-medium">Model</th>
                    <th className="px-3 py-2.5 text-right font-medium">Tokens {summary.range}</th>
                    <th className="px-3 py-2.5 text-right font-medium">Cost {summary.range}</th>
                    <th className="px-3 py-2.5 text-left font-medium" style={{ width: 200 }}>Share</th>
                    <th className="px-5 py-2.5 text-right font-medium">%</th>
                  </tr>
                </thead>
                <tbody>
                  {byAgentRows.map((a) => {
                    const pct = totalByAgent > 0 ? (a.cost / totalByAgent) * 100 : 0;
                    const isInactive = a.cost === 0;
                    const fadeClass = isInactive ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]";
                    const model = modelByAgent[a.agent_id];
                    return (
                      <tr key={a.agent_id} className="border-b border-[var(--border)]/40 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-5 py-2.5">
                          <div className="flex items-center gap-2">
                            <Avatar name={a.agent_name || a.agent_id} persona={a.agent_id} size="sm" />
                            <span className={cn("truncate", fadeClass)}>{a.agent_name || a.agent_id}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-xs text-[var(--text-secondary)]">
                          {model || "—"}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right font-mono text-xs", fadeClass)}>
                          {fmtK(a.tokens)}
                        </td>
                        <td className={cn("px-3 py-2.5 text-right font-mono", fadeClass)}>
                          {fmt$(a.cost)}
                        </td>
                        <td className="px-3 py-2.5">
                          <ProgressBar value={pct} max={100} color={personaColor(a.agent_id)} />
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-[var(--text-tertiary)]">
                          {pct.toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        {/* ─── RIGHT RAIL — Recommendations + Pricing (canonical line 144-188) ─── */}
        <aside className="flex flex-col gap-3 lg:sticky lg:top-6">
          <RecommendationsCard overview={overview} agentData={agentData} />
          <PricingCard pricing={pricing} infraCosts={infraCosts} />
        </aside>
      </div>
    </div>
  );
}

/* ═══ RecommendationsCard — right-rail panel (canonical line 146-165) ═══
   Each row: rounded-icon + body (bold name + em action text). High-priority
   rows use the "warn" accent (trending-up icon in amber); default rows use
   Info icon in slate. */
function RecommendationsCard({
  overview, agentData,
}: { overview: OverviewData; agentData: AgentDetailRow[] | null }) {
  type Rec = { id: string; tone: "warn" | "info"; body: React.ReactNode };
  const recs: Rec[] = [];

  // Budget approaching limit → warn
  for (const b of overview.budgets) {
    if (b.monthly_limit_usd && b.month_spend / b.monthly_limit_usd > 0.8) {
      recs.push({
        id: `budget-${b.id}`, tone: "warn",
        body: (
          <>
            <b>{b.scope_type}:{b.scope_id}</b> budget at{" "}
            <b>{Math.round((b.month_spend / b.monthly_limit_usd) * 100)}%</b>.{" "}
            <em className="not-italic text-[var(--text-tertiary)]">Review high-cost agents.</em>
          </>
        ),
      });
    }
  }

  // Cost anomalies → warn
  for (const anom of overview.agent_anomalies || []) {
    recs.push({
      id: `anom-${anom.agent_id}`, tone: "warn",
      body: (
        <>
          <b>{anom.agent_name || anom.agent_id}</b> spending{" "}
          <b>{anom.ratio?.toFixed(1) ?? ">2"}×</b> its 7-day average.{" "}
          <em className="not-italic text-[var(--text-tertiary)]">Likely runaway loop — inspect.</em>
        </>
      ),
    });
  }

  // Inactive agents → info
  if (agentData) {
    const inactive = agentData.filter((a) => a.active_days <= 2 && a.total_cost > 0);
    if (inactive.length > 0) {
      const sample = inactive[0]!;
      recs.push({
        id: "inactive", tone: "info",
        body: (
          <>
            <b>{sample.agent_name || sample.agent_id}</b>
            {inactive.length > 1 ? <> and {inactive.length - 1} other{inactive.length - 1 === 1 ? "" : "s"}</> : null}{" "}
            idle ≤2 days.{" "}
            <em className="not-italic text-[var(--text-tertiary)]">Deactivate to free a seat.</em>
          </>
        ),
      });
    }
  }

  // No budget set → info
  if (overview.budgets.length === 0 && overview.summary.total_cost_usd > 0) {
    recs.push({
      id: "nobudget", tone: "info",
      body: (
        <>
          <b>No ceilings set</b> while spending is non-zero.{" "}
          <em className="not-italic text-[var(--text-tertiary)]">Set a monthly cap to prevent overspending.</em>
        </>
      ),
    });
  }

  if (recs.length === 0) {
    return (
      <Card title="Recommendations" meta="0 open" flush>
        <p className="px-5 py-4 text-xs text-[var(--text-tertiary)]">All systems on track. Nothing to surface.</p>
      </Card>
    );
  }

  return (
    <Card title="Recommendations" meta={`${recs.length} open`} flush>
      <ul className="divide-y divide-[var(--border)]/50">
        {recs.map((r) => (
          <li key={r.id} className="flex items-start gap-3 px-5 py-3">
            <span
              className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
              style={{
                backgroundColor: r.tone === "warn" ? "rgba(var(--warning-rgb), 0.102)" : "rgba(var(--fg-2-rgb), 0.102)",
                color: r.tone === "warn" ? C.amber : C.slate,
              }}
            >
              {r.tone === "warn" ? <TrendingUp className="h-4 w-4" /> : <Info className="h-4 w-4" />}
            </span>
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
              {r.body}
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ═══ PricingCard — right-rail panel (canonical line 167-187) ═══
   Subscriptions + Infrastructure + Fixed monthly. Real data from /api/admin/pricing
   + /api/admin/infra-costs. If either fetch returned null (non-admin viewer or
   404), Rule 12 fail-loud: render "—" with telemetry-pending sub-text. */
function PricingCard({
  pricing, infraCosts,
}: { pricing: PricingRow[] | null; infraCosts: InfraCostRow[] | null }) {
  const subscriptionsMonthly = pricing
    ? pricing
        .filter((p) => p.pricing_type === "subscription" && p.monthly_cost_usd != null)
        .reduce((s, p) => s + Number(p.monthly_cost_usd || 0), 0)
    : null;
  const infraMonthly = infraCosts
    ? infraCosts
        .filter((i) => i.active !== false)
        .reduce((s, i) => s + Number(i.monthly_cost_usd || 0), 0)
    : null;
  const fixedMonthly = subscriptionsMonthly != null && infraMonthly != null
    ? subscriptionsMonthly + infraMonthly
    : null;

  // Counts for meta line
  const providerCount = pricing ? new Set(pricing.map((p) => p.provider)).size : null;
  const modelCount = pricing ? pricing.length : null;
  const meta = providerCount != null && modelCount != null
    ? `${providerCount} provider${providerCount === 1 ? "" : "s"} · ${modelCount} models`
    : "telemetry pending";

  return (
    <Card title="Pricing" meta={meta} flush>
      <div className="px-5 py-4 space-y-2.5">
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs text-[var(--text-secondary)]">Subscriptions</span>
          <span className="font-mono text-sm text-[var(--text-primary)]">
            {subscriptionsMonthly != null ? `${fmt$(subscriptionsMonthly)} /mo` : "—"}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs text-[var(--text-secondary)]">Infrastructure</span>
          <span className="font-mono text-sm text-[var(--text-primary)]">
            {infraMonthly != null ? `${fmt$(infraMonthly)} /mo` : "—"}
          </span>
        </div>
        <hr className="border-[var(--border)]/60" />
        <div className="flex items-baseline justify-between">
          <span className="font-mono text-xs font-medium text-[var(--text-primary)]">Fixed monthly</span>
          <span className="font-mono text-[18px] font-medium leading-none tracking-normal text-[var(--text-primary)]">
            {fixedMonthly != null ? fmt$(fixedMonthly) : "—"}
          </span>
        </div>
        {fixedMonthly == null && (
          <p className="text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            telemetry pending — admin scope required
          </p>
        )}
      </div>
      <hr className="border-[var(--border)]/60" />
      <button
        type="button"
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
      >
        Open pricing detail <ArrowRight className="h-4 w-4" />
      </button>
    </Card>
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
      {agents.map((a) => {
        // Brand bible §3.6 persona palette lock. Falls back to slate for
        // non-canonical agent slugs (apollo, etc).
        const agentAccent = personaColor(a.agent_id);
        return (
          <div
            key={a.agent_id}
            className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] p-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Avatar name={a.agent_name || a.agent_id} persona={a.agent_id} size="md" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {a.agent_name || a.agent_id}
                    </h4>
                    {anomalyMap[a.agent_id] && (
                      <span className="inline-flex items-center rounded-full bg-[var(--warning)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--warning)]">
                        {anomalyMap[a.agent_id].ratio.toFixed(1)}× avg
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {a.tenant_id} · {a.active_days}d active
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p
                  className="font-mono text-[22px] font-medium leading-none tracking-normal"
                  style={{ color: agentAccent }}
                >
                  {fmt$(a.total_cost)}
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  {fmtK(a.total_tokens)} tokens
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
              <div>
                <span className="text-[var(--text-tertiary)]">Messages</span>
                <p className="font-mono text-[var(--text-secondary)]">{a.total_messages}</p>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)]">Tool Calls</span>
                <p className="font-mono text-[var(--text-secondary)]">{a.total_tool_calls}</p>
              </div>
              <div>
                <span className="text-[var(--text-tertiary)]">$/1K tokens</span>
                <p className="font-mono text-[var(--text-secondary)]">{fmt$(a.cost_per_1k_tokens)}</p>
              </div>
            </div>
            {a.daily_trend.length > 1 && (
              <div className="mt-3 h-12">
                <Sparkline
                  data={a.daily_trend.map((d) => ({ value: d.cost }))}
                  color={agentAccent}
                  height={48}
                />
              </div>
            )}
          </div>
        );
      })}
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
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)]">
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
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)]">
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
  // PR-39 @claude review follow-up (WI-397): mutation errors must surface.
  // Mirrors the setError(...) pattern used by PricingTab's createSubscription
  // / createInfra / deleteInfra / setDefaultModel / syncOpenRouter handlers.
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!scopeId) return;
    if (!dailyLimit && !monthlyLimit) return;
    setSaving(true);
    setError(null);
    try {
      const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
      const res = await fetch("/api/costs/budgets", {
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
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${res.status} ${res.statusText}`);
      }
      onSaved();
    } catch (e) {
      setError(`Create ceiling failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setSaving(false);
  }

  async function handleDelete(id: number) {
    setDeleting(id);
    setError(null);
    try {
      const csrf2 = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
      const res = await fetch(`/api/costs/budgets?id=${id}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf2 } });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `${res.status} ${res.statusText}`);
      }
      onSaved();
    } catch (e) {
      setError(`Delete ceiling failed: ${e instanceof Error ? e.message : String(e)}`);
    }
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

        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2.5 text-xs text-[var(--danger)]">
            <span className="whitespace-pre-wrap">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="shrink-0 text-[var(--danger)] hover:opacity-80"
              aria-label="Dismiss error"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

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
        <div className="rounded-[16px] border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)] flex justify-between items-start">
          <span className="whitespace-pre-wrap">{error}</span>
          <button onClick={() => setError(null)} className="ml-4 text-[var(--danger)] hover:opacity-80"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* ── Agents → Default Model ── */}
      <section className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Agents → Default Model</h2>
        <p className="mt-1 text-xs text-[var(--text-secondary)]">
          Each agent is assigned a default model. The model pricing row determines its runtime cost (per-token or monthly subscription).
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
                // WI-399 (PR-41 follow-up sibling of WI-398): the prior `|| 0`
                // coercion turned legitimate null subscription/per-token rates
                // into a misleading "$0.00/mo" / "$0.0000 per 1k". Guard with
                // != null and render em-dash on the null side — Rule 12 fail-loud.
                const rateLabel = a.default_model_pricing_type === "subscription"
                  ? (a.default_model_monthly_cost_usd != null
                      ? `$${Number(a.default_model_monthly_cost_usd).toFixed(2)}/mo`
                      : "— /mo")
                  : a.default_model_pricing_type === "per_token"
                    ? (a.default_model_cost_per_1k_input != null && a.default_model_cost_per_1k_output != null
                        ? `$${Number(a.default_model_cost_per_1k_input).toFixed(4)} / $${Number(a.default_model_cost_per_1k_output).toFixed(4)} per 1k`
                        : "— per 1k")
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
                        {pricingOptions.map((p) => {
                          // PR-39 follow-up (WI-398): Number(null)=0 was rendering
                          // "(sub $0/mo)" for legitimate null subscription rates —
                          // implies free when actually unpriced. Rule 12 fail-loud:
                          // surface em-dash + "telemetry pending" intent over a fake zero.
                          const subLabel = p.pricing_type === "subscription"
                            ? (p.monthly_cost_usd != null
                                ? `(sub $${Number(p.monthly_cost_usd).toFixed(0)}/mo)`
                                : "(sub — /mo)")
                            : p.pricing_type === "free"
                              ? "(free)"
                              : "";
                          return (
                            <option key={`${p.provider}|${p.model_id}|${p.id}`} value={`${p.provider}|${p.model_id}`}>
                              {p.provider} / {p.display_name || p.model_id} {subLabel}
                            </option>
                          );
                        })}
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
                      className="text-[var(--danger)] hover:opacity-80 disabled:opacity-40"
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
