"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { useState, useEffect } from "react";
import {
  CardEntranceWrapper,
  EventsAreaChart,
  PulsingDot,
  SkeletonCard,
  Sparkline,
  StatCountUp,
  StatusRing,
  TokensAreaChart,
} from "./charts";
import {
  activityStatus,
  asNumber,
  formatCompact,
  formatFull,
  getOverviewMetrics,
  timeAgo,
  useAgentDetailData,
  useOverviewData,
  usePollingFetch,
  useTrendData,
} from "./api";
import { TrendCharts } from "./trend-charts";
import { TenantCards } from "./tenant-cards";
import { EmptyState, FirstRunBanner } from "./empty-states";
import { Bot, AlertTriangle, ChevronDown } from "lucide-react";
import { StatCard as UiStatCard } from "./ui-cards";

export function ShellHeader({
  title,
  subtitle,
  eyebrow = "",
  action,
  gradient = false,
}: {
  title: string;
  subtitle: string;
  eyebrow?: string;
  action?: ReactNode;
  gradient?: boolean;
}) {
  return (
    <header className="mb-5 flex items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-text-dim">
            {eyebrow}
          </p>
        ) : null}
        <h1 className={`text-2xl font-bold tracking-tight ${gradient ? "gradient-text" : "text-text"}`}>
          {title}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-text-dim">{subtitle}</p>
      </div>
      {action}
    </header>
  );
}

export function LoadingState({ label: _label = "Syncing dashboard" }: { label?: string }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SkeletonCard lines={1} height="h-10" />
        <SkeletonCard lines={1} height="h-10" />
        <SkeletonCard lines={1} height="h-10" />
        <SkeletonCard lines={1} height="h-10" />
      </div>
      <SkeletonCard lines={2} height="h-8" />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <SkeletonCard lines={3} height="h-32" />
        <SkeletonCard lines={3} height="h-32" />
      </div>
    </div>
  );
}

export function ErrorState({ error }: { error: string }) {
  return (
    <div className="rounded-3xl border border-red/40 bg-bg-card p-5 text-sm text-red">
      Live data request failed: {error}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`card-hover rounded-[22px] border border-border bg-bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.22)] ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  title,
  note,
  bar = false,
}: {
  title: string;
  note?: string;
  bar?: boolean;
}) {
  return (
    <div className={`mb-3 flex items-end justify-between gap-3 ${bar ? "border-l-2 border-cyan pl-3" : ""}`}>
      <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-text-dim">
        {title}
      </h2>
      {note ? <p className="text-xs text-text-dim">{note}</p> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent,
  sublabel,
  sparkData,
  sparkColor,
  delta,
  hero = false,
}: {
  label: string;
  value: string;
  accent: string;
  sublabel: string;
  sparkData?: Array<Record<string, number>>;
  sparkColor?: string;
  delta?: number | null;
  hero?: boolean;
}) {
  return (
    <Card className={`bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] ${hero ? "p-5" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dim">
            {label}
          </div>
          <div className={`${hero ? "mt-2 text-4xl font-extrabold tracking-[-0.04em]" : "mt-1 text-3xl font-bold"} ${accent}`}>
            {Number.isFinite(parseFloat(value)) && !/[a-zA-Z]/.test(value)
              ? <StatCountUp value={parseFloat(value)} />
              : value}
          </div>
          <div className="mt-2 flex items-center gap-2">
            {delta != null && delta !== 0 && (
              <span className={delta > 0 ? "stat-delta-up" : "stat-delta-down"}>
                {delta > 0 ? "\u2191" : "\u2193"} {Math.abs(delta).toFixed(0)}%
              </span>
            )}
            <span className="text-xs text-text-dim">{sublabel}</span>
          </div>
        </div>
        {sparkData && sparkData.length > 0 && (
          <div className="flex-shrink-0 opacity-80">
            <Sparkline
              data={sparkData}
              color={sparkColor ?? "#06d6a0"}
              width={hero ? 120 : 80}
              height={hero ? 40 : 28}
            />
          </div>
        )}
      </div>
    </Card>
  );
}

function PulseBar({ percentage }: { percentage: number }) {
  return (
    <div className="h-2 overflow-hidden rounded-full bg-border">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#06d6a0,#8b5cf6)] transition-all duration-700"
        style={{ width: `${Math.max(6, Math.min(percentage, 100))}%` }}
      />
    </div>
  );
}

function getAgentModel(agent: {
  metadata: Record<string, string | number | boolean | null>;
}) {
  const model =
    agent.metadata?.model ??
    agent.metadata?.provider ??
    agent.metadata?.instance ??
    "Mission runtime";
  return String(model);
}

function getUpdatedAtLabel(timestamp: string | undefined) {
  if (!timestamp) return "Awaiting first sync";
  return new Date(timestamp).toLocaleTimeString("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const confessions = [
  {
    title: "Daily Confession",
    verse:
      "The Lord will perfect that which concerns me; Your mercy, O Lord, endures forever.",
    reference: "Psalm 138:8",
    confession:
      "Arkon aligns with heaven's timing. The work is ordered, the systems are stable, and every assignment produces fruit.",
  },
  {
    title: "Builder's Confession",
    verse:
      "Unless the Lord builds the house, they labor in vain who build it.",
    reference: "Psalm 127:1",
    confession:
      "Every workflow, server, and agent is submitted to wisdom. Nothing is rushed, nothing is wasted, and what is built stands.",
  },
];

const actionItems = [
  {
    id: "A-101",
    priority: "P1",
    title: "Review warm agents with rising 24h event volume",
    status: "Needs routing",
    owner: "Ops",
    detail: "Focus on agents with high traffic but reduced freshness.",
  },
  {
    id: "A-118",
    priority: "P1",
    title: "Verify Dell ingress and gateway port exposure",
    status: "Monitoring",
    owner: "Infra",
    detail: "Cross-check port heartbeat against current activity windows.",
  },
  {
    id: "A-207",
    priority: "P2",
    title: "Consolidate token-heavy sessions into summary batches",
    status: "Queued",
    owner: "Automation",
    detail: "Reduce load by grouping long-running exchanges.",
  },
  {
    id: "A-244",
    priority: "P3",
    title: "Refresh visual briefing tiles for home-screen install",
    status: "Polish",
    owner: "Product",
    detail: "Keep the visual directory aligned with the new shell.",
  },
];

const visuals = [
  { slug: "briefing", label: "Morning Briefing", tone: "text-cyan", note: "Command center snapshot" },
  { slug: "tokens", label: "Token Tracker", tone: "text-purple", note: "Usage and model mix" },
  { slug: "cycling", label: "Cycling Progress", tone: "text-green", note: "Training route tracker" },
  { slug: "agents-net", label: "Agent Network", tone: "text-cyan", note: "Constellation view" },
  { slug: "architecture", label: "Architecture", tone: "text-amber", note: "Infrastructure diagram" },
  { slug: "brainmap", label: "Brain Map", tone: "text-purple", note: "Project orbit map" },
  { slug: "domains", label: "Domains", tone: "text-cyan", note: "DNS and SSL health" },
  { slug: "heatmap", label: "Heatmap", tone: "text-green", note: "Activity intensity" },
];

// Systems data is loaded from /api/systems (database-driven, no hardcoded IPs)

/* --- Helper: get agent status key --- */
function agentStatusKey(lastActive: string | null): "live" | "warm" | "idle" | "error" {
  const status = activityStatus(lastActive);
  if (status.label === "Live") return "live";
  if (status.label === "Warm") return "warm";
  if (status.label === "Offline") return "error";
  return "idle";
}

/* ── Collapsible Alerts Banner ── */
function AlertsBanner() {
  const { data, loading } = usePollingFetch<{ anomalies: AnomalyAlert[] }>(
    "/api/dashboard/anomalies?unacknowledged=true&limit=10",
    60000
  );
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const anomalies = (data?.anomalies ?? []).filter(a => !dismissed.has(a.id));

  function ackAlert(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "")
      : "";
    const csrf = typeof document !== "undefined"
      ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
    fetch("/api/dashboard/anomalies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "x-csrf-token": csrf },
      body: JSON.stringify({ id }),
    }).catch(() => {
      setDismissed(prev => { const s = new Set(prev); s.delete(id); return s; });
    });
  }

  if (loading && anomalies.length === 0) return null;

  if (anomalies.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-[16px] border border-[#1a2a4a] bg-[#0d0d1a] px-4 py-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(6,214,160,0.08)]">
          <ShieldCheckIcon className="h-4 w-4 text-[#06d6a0]" />
        </div>
        <span className="text-sm text-[#06d6a0]">All systems nominal</span>
      </div>
    );
  }

  return (
    <div className="rounded-[16px] border border-[#f59e0b]/20 bg-[#0d0d1a] overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/[0.02]"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(245,158,11,0.08)]">
          <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />
        </div>
        <span className="flex-1 text-sm font-medium text-[#e2e8f0]">
          {anomalies.length} active alert{anomalies.length !== 1 ? "s" : ""}
        </span>
        <ChevronDown className={`h-4 w-4 text-[#475569] transition-transform duration-200 ${expanded ? "" : "-rotate-90"}`} />
      </button>
      <div className={`overflow-hidden transition-all duration-200 ease-in-out ${expanded ? "max-h-[400px] opacity-100" : "max-h-0 opacity-0"}`}>
        <div className="space-y-2 px-4 pb-3">
          {anomalies.map((a) => (
            <div key={a.id} className={`flex items-center justify-between rounded-xl border px-3 py-2.5 ${
              a.level === "high" ? "border-red-500/30 bg-[rgba(239,68,68,0.06)]" : "border-[#f59e0b]/20 bg-[rgba(245,158,11,0.06)]"
            }`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold ${a.level === "high" ? "text-red-400" : "text-[#f59e0b]"}`}>
                    {a.level.toUpperCase()}
                  </span>
                  <span className="truncate text-sm text-[#e2e8f0]">{a.agent_name}</span>
                  <span className="text-xs text-[#64748b]">{a.anomaly_type.replace("_", " ")}</span>
                </div>
              </div>
              <button
                onClick={() => ackAlert(a.id)}
                className="ml-3 shrink-0 rounded-lg border border-[#1a2a4a] px-2.5 py-1 text-xs text-[#64748b] hover:text-[#06d6a0] transition"
              >
                Ack
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Inline icon to avoid another import */
function ShieldCheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function OverviewContent() {
  const { data, error, loading } = useOverviewData();
  const { data: trendData } = useTrendData("7d");

  if (loading && !data) return <LoadingState label="Loading overview" />;
  if (error && !data) return <ErrorState error={error} />;

  const metrics = getOverviewMetrics(data);
  const agents = data?.agents ?? [];
  const trend = trendData?.trend ?? [];

  // Show first-run banner if no agents registered
  if (agents.length === 0 && !loading) {
    return (
      <div className="space-y-5">
        <ShellHeader
          title="Overview"
          subtitle="Mobile command surface for live agent activity, token flow, and system pulse."
          gradient
        />
        <FirstRunBanner />
      </div>
    );
  }

  const pulse = metrics.totalAgents === 0 ? 0 : (metrics.activeAgents / metrics.totalAgents) * 100;

  // Build sparkline data from trend
  const eventsSparkData = trend.map((d) => ({ value: d.received + d.sent }));
  const tokensSparkData = trend.map((d) => ({ value: d.tokens }));
  const toolsSparkData = trend.map((d) => ({ value: d.tools }));

  // Calculate deltas (compare last day vs average of previous days)
  function calcDelta(sparkArr: Array<{ value: number }>) {
    if (sparkArr.length < 2) return null;
    const last = sparkArr[sparkArr.length - 1].value;
    const prev = sparkArr.slice(0, -1);
    const avg = prev.reduce((s, d) => s + d.value, 0) / prev.length;
    if (avg === 0) return null;
    return ((last - avg) / avg) * 100;
  }

  const eventsDelta = calcDelta(eventsSparkData);
  const tokensDelta = calcDelta(tokensSparkData);
  const toolsDelta = calcDelta(toolsSparkData);

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Overview"
        subtitle="Live agent activity, token flow, and system pulse at a glance."
        gradient
        action={
          <div className="rounded-2xl border border-border bg-bg-card px-3 py-2 text-right text-xs text-text-dim">
            <div className="text-[10px] uppercase tracking-[0.2em]">Updated</div>
            <div className="mt-1 text-sm text-text">{getUpdatedAtLabel(data?.timestamp)}</div>
          </div>
        }
      />

      {/* Row 1: 4 Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Events 24H"
          value={formatCompact(metrics.events24h)}
          accent="text-cyan"
          sublabel={`${metrics.toolsToday} tools fired`}
          sparkData={eventsSparkData}
          sparkColor="#06d6a0"
          delta={eventsDelta}
        />
        <StatCard
          label="Tokens 24H"
          value={formatCompact(metrics.tokens24h)}
          accent="text-amber"
          sublabel={`${metrics.errorsToday} errors`}
          sparkData={tokensSparkData}
          sparkColor="#f59e0b"
          delta={tokensDelta}
        />
        <StatCard
          label="Agents"
          value={String(metrics.totalAgents)}
          accent="text-cyan"
          sublabel={`${metrics.activeAgents} live now`}
          sparkData={toolsSparkData}
          sparkColor="#8b5cf6"
          delta={toolsDelta}
        />
        <Card className="!p-3 flex flex-col justify-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dim mb-1.5">System Pulse</div>
          <PulseBar percentage={pulse} />
          <div className="mt-2 flex gap-3 text-[10px]">
            <span className="text-green">{metrics.activeAgents} live</span>
            <span className="text-amber">{Math.max(metrics.totalAgents - metrics.activeAgents, 0)} idle</span>
            <span className="text-red">{metrics.errorsToday} err</span>
          </div>
        </Card>
      </div>

      {/* Row 2: Alerts banner (collapsible) */}
      <AlertsBanner />

      {/* Row 3: Trend Charts */}
      <Card>
        <TrendCharts />
      </Card>

      {/* Row 4: Clients + Agents — 2-column compact */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TenantCards data={data} />
        <Card>
          <SectionTitle title="Agents" note="Live feed" bar />
          <div className="space-y-2">
            {agents.slice(0, 5).map((agent, agentIdx) => {
              const status = activityStatus(agent.last_active);
              const statusKey = agentStatusKey(agent.last_active);
              return (
                <Link
                  key={agent.id}
                  href={`/agent/${agent.id}`}
                  className="flex items-center gap-3 rounded-xl bg-bg-deep/70 px-3 py-2.5 transition hover:bg-white/[0.02]"
                >
                  <StatusRing status={statusKey} size={24} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-text">{agent.name}</div>
                    <div className="text-[10px] text-text-dim">{timeAgo(agent.last_active)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-text">{formatCompact(asNumber(agent.events_24h))}</div>
                    <div className="text-[10px] text-text-dim">events</div>
                  </div>
                  <span className={`text-xs font-semibold ${status.tone}`}>{status.label}</span>
                </Link>
              );
            })}
            {agents.length > 5 ? (
              <Link href="/agents" className="mt-1 inline-flex text-sm font-semibold text-cyan btn-press">
                View all {agents.length} agents &rarr;
              </Link>
            ) : null}
          </div>
        </Card>
      </div>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border bg-bg-card px-3 py-2">
      <div className="text-sm font-semibold text-text">{value}</div>
      <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">{label}</div>
    </div>
  );
}

function ActionsContent() {
  const { data, error, loading } = useOverviewData();
  if (loading && !data) return <LoadingState label="Loading actions" />;
  if (error && !data) return <ErrorState error={error} />;

  const agents = data?.agents ?? [];
  const warmCount = agents.filter((agent) => activityStatus(agent.last_active).label === "Warm").length;
  const offlineCount = agents.filter((agent) => activityStatus(agent.last_active).label === "Offline").length;
  const tokenHeavy = [...agents]
    .sort((a, b) => asNumber(b.tokens_24h) - asNumber(a.tokens_24h))
    .slice(0, 3);

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Actions"
        subtitle="Priority queue translated from live telemetry. The list stays simple on mobile and readable under pressure."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Warm Agents" value={String(warmCount)} accent="text-amber" sublabel="Recently active, not hot" />
        <StatCard label="Offline Agents" value={String(offlineCount)} accent="text-red" sublabel="Need follow-up or expected idle state" />
        <StatCard label="Token Leaders" value={String(tokenHeavy.length)} accent="text-purple" sublabel="High-consumption sessions today" />
      </div>

      <Card>
        <SectionTitle title="Priority Queue" note="Operational list" bar />
        <div className="space-y-3">
          {actionItems.map((item) => (
            <div key={item.id} className="rounded-2xl border border-border bg-bg-deep/70 p-4">
              <div className="flex items-start gap-3">
                <PriorityBadge priority={item.priority} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-text">{item.title}</div>
                  <div className="mt-1 text-xs leading-6 text-text-dim">{item.detail}</div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-text-dim">
                    <Badge>{item.id}</Badge>
                    <Badge>{item.status}</Badge>
                    <Badge>{item.owner}</Badge>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Live Triggers" note="Derived from overview feed" bar />
        <div className="space-y-3">
          {tokenHeavy.map((agent) => (
            <div key={agent.id} className="flex items-center justify-between gap-4 rounded-2xl bg-bg-deep/70 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-text">{agent.name}</div>
                <div className="text-xs text-text-dim">{getAgentModel(agent)}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-amber">
                  {formatCompact(asNumber(agent.tokens_24h))}
                </div>
                <div className="text-[11px] text-text-dim">tokens / 24h</div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const classes =
    priority === "P1"
      ? "bg-red text-white"
      : priority === "P2"
        ? "bg-amber text-bg-deep"
        : "bg-text-dim text-white";

  return (
    <div className={`flex h-11 min-w-11 items-center justify-center rounded-xl text-xs font-bold ${classes}`}>
      {priority}
    </div>
  );
}

function Badge({ children }: { children: ReactNode }) {
  return <span className="rounded-full border border-border px-2.5 py-1">{children}</span>;
}

function HealthContent() {
  const { data, error, loading } = useOverviewData();
  if (loading && !data) return <LoadingState label="Loading health" />;
  if (error && !data) return <ErrorState error={error} />;

  const metrics = getOverviewMetrics(data);
  const kmTotal = Math.min(400, Math.max(60, metrics.events7d + metrics.activeAgents * 8));
  const progress = Math.round((kmTotal / 400) * 100);
  const rides = [
    { label: "Sat 7 Mar", duration: "5h 28m", distance: kmTotal, intensity: 100 },
    { label: "Fri 6 Mar", duration: "2h 05m", distance: Math.max(12, Math.round(kmTotal * 0.34)), intensity: 42 },
    { label: "Thu 5 Mar", duration: "1h 18m", distance: Math.max(8, Math.round(kmTotal * 0.2)), intensity: 25 },
  ];

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Health"
        subtitle="Training dashboard adapted to the Arkon shell. Progress values derive from current live activity so the page stays dynamic."
      />

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-[280px_1fr] md:items-center">
          <ProgressRing progress={progress} />
          <div>
            <SectionTitle title="Ride Summary" note="400km goal" bar />
            <div className="rounded-2xl bg-bg-deep/70 p-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-text-dim">Start</span>
                <span className="text-text-dim">Goal</span>
              </div>
              <div className="h-3 rounded-full bg-border">
                <div
                  className="relative h-full rounded-full bg-[linear-gradient(90deg,#22c55e,#06d6a0)]"
                  style={{ width: `${progress}%` }}
                >
                  <span className="absolute right-0 top-1/2 flex h-6 w-6 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border-2 border-bg-deep bg-green text-[10px]">
                    &nearr;
                  </span>
                </div>
              </div>
              <div className="mt-3 flex justify-between text-[11px] text-text-dim">
                <span>0km</span>
                <span>100km</span>
                <span>200km</span>
                <span>300km</span>
                <span>400km</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Est. KM" value={String(kmTotal)} accent="text-green" sublabel="Derived from recent system movement" />
        <StatCard label="Target Days" value="4" accent="text-purple" sublabel="Training horizon" />
        <StatCard label="Live Nodes" value={String(metrics.activeAgents)} accent="text-cyan" sublabel="Used as momentum proxy" />
        <StatCard label="Load" value={formatCompact(metrics.events24h)} accent="text-amber" sublabel="Telemetry volume today" />
      </div>

      <Card>
        <SectionTitle title="Recent Rides" note="Mobile quick-scan" bar />
        <div className="space-y-3">
          {rides.map((ride) => (
            <div key={ride.label} className="rounded-2xl bg-bg-deep/70 p-4">
              <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between">
                <span className="font-semibold text-text">{ride.label}</span>
                <span className="text-green">{ride.duration}</span>
              </div>
              <div className="mt-1 text-xs text-text-dim">{ride.distance}km estimated effort</div>
              <div className="mt-3 h-2 rounded-full bg-green/10">
                <div className="h-full rounded-full bg-green" style={{ width: `${ride.intensity}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function ProgressRing({ progress }: { progress: number }) {
  const radius = 84;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress / 100);

  return (
    <div className="mx-auto relative h-[220px] w-[220px]">
      <svg viewBox="0 0 220 220" className="-rotate-90">
        <defs>
          <linearGradient id="healthRing" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#22c55e" />
            <stop offset="100%" stopColor="#06d6a0" />
          </linearGradient>
        </defs>
        <circle cx="110" cy="110" r={radius} stroke="#1a2a4a" strokeWidth="14" fill="none" />
        <circle
          cx="110"
          cy="110"
          r={radius}
          stroke="url(#healthRing)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="text-4xl font-bold text-green">{progress}%</div>
        <div className="text-sm text-text-dim">of 400km</div>
        <div className="mt-1 text-xs text-text-dim">progress ring</div>
      </div>
    </div>
  );
}

function AgentsContent() {
  const { data, error, loading } = useOverviewData();
  if (loading && !data) return <LoadingState label="Loading agents" />;
  if (error && !data) return <ErrorState error={error} />;

  const agents = data?.agents ?? [];

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Agents"
        subtitle="Sub-agent status cards focused on freshness, model context, and recent workload."
      />
      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="No agents registered"
          description="Register your first agent in the Admin Panel to start monitoring its activity, sessions, and performance."
          action="Go to Admin Panel"
          actionHref="/admin"
        />
      ) : null}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {agents.map((agent) => {
          const status = activityStatus(agent.last_active);
          const statusKey = agentStatusKey(agent.last_active);
          const accentClass =
            statusKey === "live" ? "agent-accent-live" :
            statusKey === "warm" ? "agent-accent-warm" :
            statusKey === "error" ? "agent-accent-error" : "agent-accent-idle";

          return (
            <Card key={agent.id} className={`${status.panel} ${accentClass}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <StatusRing status={statusKey} size={36} />
                  <div>
                    <h2 className="text-lg font-semibold text-text">{agent.name}</h2>
                    <p className="mt-0.5 text-xs text-text-dim">{agent.id}</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone} bg-white/5`}>
                  {status.label}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MiniMetric label="model" value={getAgentModel(agent)} />
                <MiniMetric label="last active" value={timeAgo(agent.last_active)} />
                <MiniMetric label="events 24h" value={formatFull(asNumber(agent.events_24h))} />
                <MiniMetric label="tokens 24h" value={formatCompact(asNumber(agent.tokens_24h))} />
              </div>
              <Link href={`/agent/${agent.id}`} className="mt-4 inline-flex text-sm font-semibold text-cyan btn-press">
                Open detail &rarr;
              </Link>
            </Card>
          );
        })}
      </div>
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

type LiveService = {
  name: string; host: string; port: number; group: string;
  online: boolean; latencyMs: number | null; checkedAt: string;
};
type SystemsApiData = {
  services: LiveService[];
  byGroup: Record<string, LiveService[]>;
  summary: { total: number; online: number; offline: number };
  checkedAt: string;
};

function SystemsContent() {
  const { data: overviewData, loading: overviewLoading } = useOverviewData();
  const { data: sysData, error: sysError, loading: sysLoading } = usePollingFetch<SystemsApiData>("/api/systems", 30000);

  if ((sysLoading && !sysData) || (overviewLoading && !overviewData)) return <LoadingState label="Loading systems" />;

  const metrics = getOverviewMetrics(overviewData);
  const groups = sysData?.byGroup ?? {};
  const summary = sysData?.summary;

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Systems"
        subtitle="Live TCP port checks across your infrastructure. Auto-refreshes every 30s."
        action={sysData ? (
          <div className="rounded-2xl border border-border bg-bg-card px-3 py-2 text-right text-xs text-text-dim">
            <div className="text-[10px] uppercase tracking-[0.2em]">Last Check</div>
            <div className="mt-1 text-sm text-text">{new Date(sysData.checkedAt).toLocaleTimeString("en-ZA")}</div>
          </div>
        ) : undefined}
      />

      {sysError && <ErrorState error={sysError} />}

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard label="Live Services" value={String(summary.online)} accent="text-green" sublabel={`of ${summary.total} total`} />
          <StatCard label="Offline" value={String(summary.offline)} accent={summary.offline > 0 ? "text-red" : "text-text-dim"} sublabel="Not responding" />
          <StatCard label="Agents Routing" value={String(metrics.activeAgents)} accent="text-cyan" sublabel="Current live agent count" />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Object.entries(groups).map(([groupName, services]) => {
          const allOnline = services.every((s) => s.online);
          const anyOnline = services.some((s) => s.online);
          return (
            <Card key={groupName} className={allOnline ? "border-green/20" : anyOnline ? "border-amber/20" : "border-red/20"}>
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-text">{groupName}</h2>
                  <p className="mt-1 text-xs text-text-dim">{services[0]?.host}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  allOnline ? "bg-green/15 text-green" : anyOnline ? "bg-amber/15 text-amber" : "bg-red/15 text-red"
                }`}>
                  {allOnline ? "All Online" : anyOnline ? "Degraded" : "Offline"}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {services.map((svc) => (
                  <div key={`${svc.name}-${svc.port}`} className="flex items-center justify-between rounded-2xl bg-bg-deep/70 px-3 py-3">
                    <div>
                      <div className="text-sm font-semibold text-text">{svc.name}</div>
                      <div className="text-xs text-text-dim">:{svc.port}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {svc.latencyMs !== null && (
                        <span className="text-xs text-text-dim">{svc.latencyMs}ms</span>
                      )}
                      <PulsingDot status={svc.online ? "live" : "error"} />
                      <span className={`text-xs font-semibold ${svc.online ? "text-green" : "text-red"}`}>
                        {svc.online ? "Live" : "Down"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
        {/* Fallback if API not yet available */}
        {Object.keys(groups).length === 0 && !sysLoading && (
          <Card>
            <p className="text-sm text-text-dim">System checks initialising...</p>
          </Card>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="24h Events" value={formatCompact(metrics.events24h)} accent="text-purple" sublabel="Infrastructure traffic proxy" />
        <StatCard label="7d Events" value={formatCompact(metrics.events7d)} accent="text-cyan" sublabel="Weekly activity" />
        <StatCard label="Tokens 24H" value={formatCompact(metrics.tokens24h)} accent="text-amber" sublabel="AI compute usage" />
      </div>
    </div>
  );
}

function ConfessionsContent() {
  const { data, error, loading } = useOverviewData();
  if (loading && !data) return <LoadingState label="Loading confessions" />;
  if (error && !data) return <ErrorState error={error} />;

  const metrics = getOverviewMetrics(data);

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Confessions"
        subtitle="Daily confession and scripture cards with the same visual language as the canvas reference, rebuilt for the app shell."
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {confessions.map((item) => (
          <Card
            key={item.title}
            className="bg-[linear-gradient(135deg,rgba(13,13,26,1),rgba(26,13,46,0.96))] border-purple/30"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-text-dim">
              {item.title}
            </p>
            <p className="mt-4 text-base italic leading-7 text-purple">{item.verse}</p>
            <p className="mt-2 text-right text-xs text-text-dim">{item.reference}</p>
            <p className="mt-4 border-t border-purple/20 pt-4 text-sm leading-7 text-text">
              {item.confession}
            </p>
          </Card>
        ))}
      </div>

      <Card>
        <SectionTitle title="Application" note="Linked to current pulse" bar />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MiniMetric label="active agents" value={String(metrics.activeAgents)} />
          <MiniMetric label="events today" value={formatCompact(metrics.events24h)} />
          <MiniMetric label="token flow" value={formatCompact(metrics.tokens24h)} />
        </div>
      </Card>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function VisualsContent() {
  const { data, error, loading } = useOverviewData();
  if (loading && !data) return <LoadingState label="Loading visuals" />;
  if (error && !data) return <ErrorState error={error} />;

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Visuals"
        subtitle="Directory of the eight reference visual canvases so they remain accessible from the rebuilt PWA."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {visuals.map((item) => (
          <Link
            key={item.slug}
            href={`/visuals/${item.slug}`}
            className="card-hover rounded-[22px] border border-border bg-bg-card p-5 transition hover:border-cyan/40 hover:bg-white/[0.03]"
          >
            <div className={`text-sm font-semibold uppercase tracking-[0.18em] ${item.tone}`}>{item.label}</div>
            <p className="mt-2 text-sm leading-6 text-text-dim">{item.note}</p>
            <p className="mt-5 text-xs font-semibold text-text">Open standalone visual &rarr;</p>
          </Link>
        ))}
      </div>
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function eventIcon(type: string) {
  switch (type) {
    case "message_received":
      return "IN";
    case "message_sent":
      return "OUT";
    case "tool_call":
      return "TOOL";
    case "error":
      return "ERR";
    case "cron":
      return "CRON";
    default:
      return "EVT";
  }
}

function eventTone(type: string) {
  switch (type) {
    case "message_received":
      return "border-green/30 bg-green/10 text-green";
    case "message_sent":
      return "border-cyan/30 bg-cyan/10 text-cyan";
    case "tool_call":
      return "border-purple/30 bg-purple/10 text-purple";
    case "error":
      return "border-red/30 bg-red/10 text-red";
    default:
      return "border-border bg-bg-deep/60 text-text-dim";
  }
}

function AgentDetailContent() {
  const params = useParams<{ id: string }>();
  const agentId = params.id;
  const { data, error, loading } = useAgentDetailData(agentId);

  if (loading && !data) return <LoadingState label="Loading agent detail" />;
  if (error && !data) return <ErrorState error={error} />;
  if (!data?.agent) return <ErrorState error="Agent not found" />;

  const agent = data.agent;

  return (
    <div className="space-y-5">
      <ShellHeader
        eyebrow="Agent Detail"
        title={agent.name}
        subtitle={`${agent.id} · ${agent.metadata?.instance ?? "Mission runtime"}`}
        action={
          <Link
            href="/agents"
            className="rounded-2xl border border-border bg-bg-card px-4 py-3 text-sm font-semibold text-text btn-press"
          >
            Back
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Events"
          value={formatCompact(data.events.length)}
          accent="text-cyan"
          sublabel="Last 50 timeline entries"
        />
        <StatCard
          label="Sessions"
          value={formatCompact(data.sessions.length)}
          accent="text-purple"
          sublabel="Recent active channels"
        />
        <StatCard
          label="7 Day Stats"
          value={formatCompact(data.stats.length)}
          accent="text-amber"
          sublabel="Daily stat rows"
        />
        <StatCard
          label="Updated"
          value={getUpdatedAtLabel(data.timestamp)}
          accent="text-green"
          sublabel="Live polling active"
        />
      </div>

      <Card>
        <SectionTitle title="Recent Sessions" bar />
        <div className="space-y-3">
          {data.sessions.length === 0 ? (
            <p className="text-sm text-text-dim">No recent sessions.</p>
          ) : (
            data.sessions.slice(0, 8).map((session) => (
              <div key={session.session_key} className="rounded-2xl bg-bg-deep/70 p-4">
                <div className="text-sm font-semibold text-text">{session.session_key}</div>
                <div className="mt-1 text-xs text-text-dim">
                  {session.channel_id || "unknown channel"} · {session.message_count} messages · Last active{" "}
                  {timeAgo(session.last_active)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <Card>
        <SectionTitle title="Event Timeline" note="Last 50" bar />
        <div className="space-y-3">
          {data.events.length === 0 ? (
            <p className="text-sm text-text-dim">No events captured yet.</p>
          ) : (
            data.events.map((event) => (
              <div key={event.id} className="rounded-2xl border border-border bg-bg-deep/70 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <span className={`rounded-xl border px-2.5 py-1 text-[10px] font-bold ${eventTone(event.event_type)}`}>
                      {eventIcon(event.event_type)}
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-text">
                        {event.event_type.replaceAll("_", " ")}
                      </div>
                      <div className="mt-1 text-xs text-text-dim">
                        {event.channel_id || "no channel"} · {timeAgo(event.created_at)}
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] text-text-dim">{event.token_estimate || 0} tok</span>
                </div>
                {event.content ? (
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl border border-border bg-bg-card p-3 text-xs leading-6 text-text">
                    {event.content}
                  </pre>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

/* --- Anomaly Widget (BaselineWatch) --- */
interface AnomalyAlert {
  id: string;
  agent_id: string;
  agent_name: string;
  anomaly_type: string;
  level: "medium" | "high";
  current_rate: number;
  baseline_rate: number;
  multiplier: number;
  created_at: string;
  acknowledged: boolean;
}

export function AnomalyWidget() {
  const { data, loading } = usePollingFetch<{ anomalies: AnomalyAlert[] }>(
    "/api/dashboard/anomalies?unacknowledged=true&limit=5",
    60000
  );

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const anomalies = (data?.anomalies ?? []).filter(a => !dismissed.has(a.id));

  function ackAlert(id: string) {
    setDismissed(prev => new Set([...prev, id]));
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "")
      : "";
    const csrf = typeof document !== "undefined"
      ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
    fetch("/api/dashboard/anomalies", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, "x-csrf-token": csrf },
      body: JSON.stringify({ id }),
    }).catch(() => {
      setDismissed(prev => { const s = new Set(prev); s.delete(id); return s; });
    });
  }

  if (loading && anomalies.length === 0) return null;
  if (anomalies.length === 0) return (
    <Card>
      <SectionTitle title="BaselineWatch" note="Anomaly Detection" />
      <div className="flex items-center gap-2 text-sm text-[#06d6a0]">
        <ShieldCheckIcon className="h-4 w-4" />
        <span>All agents operating within normal parameters</span>
      </div>
    </Card>
  );

  return (
    <Card className="border-amber-500/30">
      <SectionTitle title="Anomaly Alerts" note={`${anomalies.length} active`} />
      <div className="space-y-2">
        {anomalies.map((a) => (
          <div key={a.id} className={`flex items-center justify-between rounded-2xl border px-4 py-3 ${
            a.level === "high" ? "border-red-500/30 bg-[rgba(239,68,68,0.06)]" : "border-amber-500/20 bg-[rgba(245,158,11,0.06)]"
          }`}>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-bold ${a.level === "high" ? "text-red-400" : "text-amber-400"}`}>
                  {a.level.toUpperCase()}
                </span>
                <span className="text-sm text-[#e2e8f0]">{a.agent_name}</span>
                <span className="text-xs text-[#64748b]">{a.anomaly_type.replace("_", " ")}</span>
              </div>
              <div className="mt-0.5 text-xs text-[#64748b]">
                {a.anomaly_type === "rate_spike"
                  ? `${parseFloat(String(a.multiplier ?? 0)).toFixed(1)}x baseline · ${Math.round(Number(a.current_rate))} vs ${Math.round(Number(a.baseline_rate))} events/hr`
                  : a.anomaly_type === "rate_silence" ? "Agent went silent (below 10% of baseline)" : a.anomaly_type}
              </div>
            </div>
            <button
              onClick={() => ackAlert(a.id)}
              className="ml-3 shrink-0 rounded-lg border border-[#1a2a4a] px-2.5 py-1 text-xs text-[#64748b] hover:text-[#06d6a0] transition btn-press"
            >
              Ack
            </button>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function OverviewScreen() {
  return <OverviewContent />;
}

export function ActionsScreen() {
  return <ActionsContent />;
}

export function HealthScreen() {
  return <HealthContent />;
}

export function AgentsScreen() {
  return <AgentsContent />;
}

export function SystemsScreen() {
  return <SystemsContent />;
}

export function ConfessionsScreen() {
  return <ConfessionsContent />;
}

export function VisualsScreen() {
  return <VisualsContent />;
}

export function AgentDetailScreen() {
  return <AgentDetailContent />;
}
