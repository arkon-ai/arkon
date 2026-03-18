"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ShellHeader, Card, SectionTitle } from "@/components/mission-control/dashboard";
import { CardEntranceWrapper, SkeletonCard } from "@/components/mission-control/charts";
import { useActiveRuns } from "@/hooks/use-active-runs";
import { KillConfirmModal } from "@/components/mission-control/kill-confirm-modal";
import { OctagonX, Pause, Play, Shield, DollarSign, Activity, Zap, AlertTriangle } from "lucide-react";

/* ─── Types ─────────────────────────────────────────────── */

interface Event {
  id: string;
  event_type: string;
  direction: string;
  session_key: string;
  channel_id: string;
  sender: string;
  content: string;
  content_redacted: boolean;
  metadata: Record<string, unknown>;
  token_estimate: number;
  created_at: string;
  threat_level?: string;
  threat_classes?: string | string[];
}

interface AgentData {
  agent: {
    id: string;
    name: string;
    role: string;
    metadata: Record<string, unknown>;
    tenant_id: string;
    created_at: string;
    updated_at: string;
  };
  events: Event[];
  sessions: Array<{
    session_key: string;
    channel_id: string;
    last_active: string;
    message_count: number;
    started_at: string;
  }>;
  stats: Array<{
    day: string;
    messages_received: number;
    messages_sent: number;
    tool_calls: number;
    errors: number;
    estimated_tokens: number;
    estimated_cost_usd: number;
  }>;
  cost: { cost_30d: number; tokens_30d: number };
  threats: {
    threat_count_30d: number;
    severe_count_30d: number;
    recent: Array<{
      id: string;
      event_type: string;
      threat_level: string;
      threat_classes: string | string[];
      created_at: string;
    }>;
  };
  errorRate: { errors_7d: number; total_events_7d: number };
  topTools: Array<{ tool_name: string; call_count: number }>;
  lastActive: string | null;
}

/* ─── Auth ───────────────────────────────────────────────── */

function getToken(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "";
}

/* ─── Helpers ────────────────────────────────────────────── */

const EVENT_ICON: Record<string, string> = {
  message_received: "\u{1F4E5}",
  message_sent: "\u{1F4E4}",
  tool_call: "\u{1F527}",
  error: "\u274C",
  cron: "\u23F0",
  system: "\u2699\uFE0F",
  note: "\u{1F4DD}",
};

const EVENT_COLOUR: Record<string, string> = {
  message_received: "border-[#00D47E]/30 bg-[rgba(0,212,126,0.04)]",
  message_sent: "border-[#8888A0]/30 bg-[rgba(136,136,160,0.04)]",
  tool_call: "border-[#f59e0b]/30 bg-[rgba(245,158,11,0.04)]",
  error: "border-red-500/30 bg-[rgba(239,68,68,0.04)]",
  cron: "border-sky-500/30 bg-[rgba(14,165,233,0.04)]",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f59e0b",
  medium: "#06B6D4",
  low: "#8888A0",
};

const ROLE_COLOURS: Record<string, string> = {
  owner: "bg-[rgba(0,212,126,0.15)] text-[#00D47E]",
  admin: "bg-[rgba(0,212,126,0.15)] text-cyan-400",
  agent: "bg-[rgba(59,130,246,0.15)] text-blue-400",
  viewer: "bg-[rgba(100,116,139,0.15)] text-slate-400",
};

function eventColour(type: string) {
  return EVENT_COLOUR[type] ?? "border-[#2E2E3A] bg-[#0d0d18]";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatCost(v: number): string {
  return v < 0.01 ? "<$0.01" : `$${v.toFixed(2)}`;
}

function formatCompact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
  return String(v);
}

function getFramework(metadata: Record<string, unknown>): string {
  return String(metadata?.framework ?? metadata?.agent_framework ?? "OpenClaw");
}

function getModel(metadata: Record<string, unknown>): string {
  return String(metadata?.model ?? metadata?.primary_model ?? "unknown");
}

function parseJsonField<T>(value: string | T): T {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return [] as unknown as T; }
  }
  return value;
}

/* ─── Chart tooltip ──────────────────────────────────────── */

function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; fill?: string; stroke?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#2E2E3A] bg-[#0A0A0C] px-3 py-2 text-xs">
      <p className="mb-1 font-semibold text-[#94a3b8]">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill ?? p.stroke ?? "#00D47E" }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

/* ─── Tab navigation ─────────────────────────────────────── */

type ProfileTab = "overview" | "security" | "performance" | "activity";

const TABS: Array<{ key: ProfileTab; label: string; icon: React.ReactNode }> = [
  { key: "overview", label: "Overview", icon: <Activity className="h-4 w-4" /> },
  { key: "security", label: "Security", icon: <Shield className="h-4 w-4" /> },
  { key: "performance", label: "Performance", icon: <Zap className="h-4 w-4" /> },
  { key: "activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
];

/* ─── Stat pill ──────────────────────────────────────────── */

function StatPill({ label, value, colour = "text-[#00D47E]", subtext }: { label: string; value: string | number; colour?: string; subtext?: string }) {
  return (
    <div className="rounded-2xl border border-[#2E2E3A] bg-[#0A0A0C]/70 px-4 py-3 text-center">
      <div className={`text-xl font-bold ${colour}`}>{value}</div>
      <div className="mt-0.5 text-xs text-[#8888A0]">{label}</div>
      {subtext && <div className="mt-0.5 text-[10px] text-[#555566]">{subtext}</div>}
    </div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */

export default function AgentDetailPage() {
  const params = useParams();
  const agentId = params.id as string;
  const [data, setData] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [activeTab, setActiveTab] = useState<ProfileTab>("overview");
  const { runs: agentRuns, killRun, pauseRun, resumeRun } = useActiveRuns(agentId);
  const [killTarget, setKillTarget] = useState<typeof agentRuns[0] | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const token = getToken();
      const res = await fetch(`/api/dashboard/agent/${agentId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json() as AgentData;
      setData(json);
    } catch (err) {
      console.error("Agent detail fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void fetchData();
    const iv = setInterval(() => void fetchData(), 15000);
    return () => clearInterval(iv);
  }, [fetchData]);

  /* ── Derived ── */
  const totalMessages = data?.stats.reduce((s, d) => s + d.messages_received + d.messages_sent, 0) ?? 0;
  const totalTokens = data?.stats.reduce((s, d) => s + (d.estimated_tokens ?? 0), 0) ?? 0;
  const totalErrors = data?.stats.reduce((s, d) => s + (d.errors ?? 0), 0) ?? 0;
  const totalToolCalls = data?.stats.reduce((s, d) => s + (d.tool_calls ?? 0), 0) ?? 0;
  const costThisMonth = data?.cost?.cost_30d ?? 0;
  const threatCount30d = data?.threats?.threat_count_30d ?? 0;
  const severeCount30d = data?.threats?.severe_count_30d ?? 0;
  const errorRate7d = data?.errorRate?.total_events_7d
    ? Math.round((data.errorRate.errors_7d / data.errorRate.total_events_7d) * 100)
    : 0;

  const chartData = [...(data?.stats ?? [])].reverse().map((s) => ({
    day: new Date(s.day).toLocaleDateString("en-ZA", { weekday: "short" }),
    received: s.messages_received,
    sent: s.messages_sent,
    tools: s.tool_calls,
    tokens: Math.round((s.estimated_tokens ?? 0) / 1000),
    errors: s.errors,
    cost: Number(s.estimated_cost_usd ?? 0),
  }));

  const eventTypes = ["all", ...Array.from(new Set((data?.events ?? []).map((e) => e.event_type)))];
  const filteredEvents = filter === "all" ? (data?.events ?? []) : (data?.events ?? []).filter((e) => e.event_type === filter);

  const framework = data?.agent ? getFramework(data.agent.metadata) : "Unknown";
  const model = data?.agent ? getModel(data.agent.metadata) : "unknown";

  const isOnline = data?.lastActive
    ? (Date.now() - new Date(data.lastActive).getTime()) < 300000
    : false;

  /* ── Loading ── */
  if (loading) {
    return (
      <div className="space-y-4 pb-24">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (!data?.agent) {
    return (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-red-500/20 bg-[rgba(239,68,68,0.04)]">
        <p className="text-sm text-red-400">Agent not found</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      {/* ── Header ── */}
      <ShellHeader
        title={data.agent.name}
        subtitle={`${data.agent.id}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Status */}
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              isOnline ? "bg-green/15 text-green" : "bg-white/5 text-text-dim"
            }`}>
              <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green animate-pulse" : "bg-[#555566]"}`} />
              {isOnline ? "Active" : "Offline"}
            </span>

            {/* Framework */}
            <span className="rounded-full bg-cyan/10 px-2.5 py-1 text-xs font-semibold text-cyan">
              {framework}
            </span>

            {/* Role */}
            {data.agent.role && (
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ROLE_COLOURS[data.agent.role] ?? ""}`}>
                {data.agent.role}
              </span>
            )}

            {/* Kill/Pause/Resume */}
            {agentRuns.length > 0 && (
              <>
                {agentRuns[0].status === "running" ? (
                  <button
                    type="button"
                    onClick={() => pauseRun(agentRuns[0].run_id)}
                    className="flex h-8 items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/20"
                  >
                    <Pause className="h-3.5 w-3.5" />
                    Pause
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => resumeRun(agentRuns[0].run_id)}
                    className="flex h-8 items-center gap-1.5 rounded-xl border border-green-500/30 bg-green-500/10 px-3 text-xs font-semibold text-green-300 transition hover:bg-green-500/20"
                  >
                    <Play className="h-3.5 w-3.5" />
                    Resume
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setKillTarget(agentRuns[0])}
                  className="flex h-8 items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-600/20 px-3 text-xs font-bold uppercase text-red-200 transition hover:bg-red-600/40"
                >
                  <OctagonX className="h-3.5 w-3.5" />
                  Emergency Stop
                </button>
              </>
            )}
          </div>
        }
      />

      {killTarget ? (
        <KillConfirmModal
          run={killTarget}
          onConfirm={async (reason) => {
            await killRun(killTarget.run_id, reason);
            setKillTarget(null);
          }}
          onCancel={() => setKillTarget(null)}
        />
      ) : null}

      {/* ── Quick Stats Row ── */}
      <CardEntranceWrapper>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatPill label="Cost (30d)" value={formatCost(costThisMonth)} colour="text-[#00D47E]" />
          <StatPill label="Messages (7d)" value={totalMessages} colour="text-[#8888A0]" />
          <StatPill
            label="Threats (30d)"
            value={threatCount30d}
            colour={severeCount30d > 0 ? "text-red-400" : threatCount30d > 0 ? "text-amber-400" : "text-[#8888A0]"}
            subtext={severeCount30d > 0 ? `${severeCount30d} severe` : undefined}
          />
          <StatPill label="Error Rate (7d)" value={`${errorRate7d}%`} colour={errorRate7d > 10 ? "text-red-400" : "text-[#8888A0]"} />
          <StatPill label="Last Active" value={timeAgo(data.lastActive)} colour="text-text-dim" />
        </div>
      </CardEntranceWrapper>

      {/* ── Tab Bar ── */}
      <div className="flex gap-1 rounded-xl border border-[#2E2E3A] bg-[#0A0A0C]/70 p-1">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-cyan/10 text-cyan"
                : "text-text-dim hover:bg-white/5 hover:text-text"
            }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      {activeTab === "overview" && (
        <OverviewTab data={data} chartData={chartData} model={model} framework={framework} />
      )}
      {activeTab === "security" && (
        <SecurityTab data={data} />
      )}
      {activeTab === "performance" && (
        <PerformanceTab data={data} chartData={chartData} totalMessages={totalMessages} totalToolCalls={totalToolCalls} totalTokens={totalTokens} totalErrors={totalErrors} errorRate7d={errorRate7d} />
      )}
      {activeTab === "activity" && (
        <ActivityTab
          events={data.events}
          filteredEvents={filteredEvents}
          eventTypes={eventTypes}
          filter={filter}
          setFilter={setFilter}
          expandedEvent={expandedEvent}
          setExpandedEvent={setExpandedEvent}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ── Overview Tab ──────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════ */

function OverviewTab({ data, chartData, model, framework }: {
  data: AgentData;
  chartData: Array<Record<string, unknown>>;
  model: string;
  framework: string;
}) {
  return (
    <div className="space-y-5">
      {/* Identity */}
      <Card>
        <SectionTitle title="Identity" />
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <InfoRow label="Name" value={data.agent.name} />
          <InfoRow label="Agent ID" value={data.agent.id} mono />
          <InfoRow label="Framework" value={framework} />
          <InfoRow label="Primary Model" value={model} />
          <InfoRow label="Role" value={data.agent.role ?? "agent"} />
          <InfoRow label="Tenant" value={String(data.agent.tenant_id ?? "default")} />
          <InfoRow label="Created" value={fmtDate(data.agent.created_at)} />
          <InfoRow label="Last Updated" value={data.agent.updated_at ? fmtDate(data.agent.updated_at) : "—"} />
        </div>
      </Card>

      {/* Message volume chart */}
      {chartData.length > 0 && (
        <Card>
          <SectionTitle title="Message Volume — 7 Days" />
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D47E" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#00D47E" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8888A0" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8888A0" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E3A" />
              <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="received" name="Received" stroke="#00D47E" strokeWidth={2} fill="url(#gradRecv)" dot={false} />
              <Area type="monotone" dataKey="sent" name="Sent" stroke="#8888A0" strokeWidth={2} fill="url(#gradSent)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Sessions */}
      {data.sessions.length > 0 && (
        <Card>
          <SectionTitle title="Recent Sessions" note={`${data.sessions.length} sessions`} />
          <div className="space-y-2">
            {data.sessions.slice(0, 5).map((s) => (
              <div key={s.session_key} className="flex items-center justify-between rounded-2xl border border-[#2E2E3A] bg-[#0A0A0C]/70 px-4 py-3">
                <div>
                  <div className="font-mono text-xs text-[#00D47E] truncate max-w-[200px] sm:max-w-none">{s.session_key}</div>
                  <div className="mt-0.5 text-xs text-[#8888A0]">{s.channel_id || "unknown channel"}</div>
                </div>
                <div className="text-right text-xs text-[#8888A0]">
                  <div>{s.message_count} msgs</div>
                  <div>{fmtTime(s.last_active)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ── Security Tab ──────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════ */

function SecurityTab({ data }: { data: AgentData }) {
  const threats = data.threats;

  return (
    <div className="space-y-5">
      {/* Threat summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatPill
          label="Threats (30d)"
          value={threats.threat_count_30d}
          colour={threats.severe_count_30d > 0 ? "text-red-400" : threats.threat_count_30d > 0 ? "text-amber-400" : "text-[#8888A0]"}
        />
        <StatPill
          label="Severe (30d)"
          value={threats.severe_count_30d}
          colour={threats.severe_count_30d > 0 ? "text-red-400" : "text-[#8888A0]"}
        />
        <StatPill
          label="Error Rate (7d)"
          value={`${data.errorRate.total_events_7d ? Math.round((data.errorRate.errors_7d / data.errorRate.total_events_7d) * 100) : 0}%`}
          colour={data.errorRate.errors_7d > 0 ? "text-amber-400" : "text-[#8888A0]"}
        />
      </div>

      {/* Recent threats */}
      <Card>
        <SectionTitle title="Recent Threat Events" note={`${threats.recent.length} events`} />
        {threats.recent.length === 0 ? (
          <div className="py-8 text-center">
            <Shield className="mx-auto h-8 w-8 text-[#2E2E3A]" />
            <p className="mt-2 text-sm text-text-dim">No threats detected for this agent</p>
          </div>
        ) : (
          <div className="space-y-2">
            {threats.recent.map((t) => {
              const classes = parseJsonField<string[]>(t.threat_classes);
              return (
                <Link
                  key={t.id}
                  href="/threatguard"
                  className="flex items-center justify-between rounded-xl border border-[#2E2E3A] bg-white/[0.02] px-4 py-3 transition hover:bg-white/[0.04]"
                >
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-4 w-4" style={{ color: SEVERITY_COLORS[t.threat_level] ?? "#8888A0" }} />
                    <div>
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                        style={{
                          background: `${SEVERITY_COLORS[t.threat_level]}15`,
                          color: SEVERITY_COLORS[t.threat_level] ?? "#8888A0",
                        }}
                      >
                        {t.threat_level}
                      </span>
                      {classes.map((cls) => (
                        <span key={cls} className="ml-2 text-[10px] text-text-dim">
                          {cls.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="text-xs text-text-dim">{timeAgo(t.created_at)}</span>
                </Link>
              );
            })}
          </div>
        )}
        {threats.threat_count_30d > threats.recent.length && (
          <Link href="/threatguard" className="mt-3 inline-flex text-sm font-semibold text-cyan">
            View all in ThreatGuard &rarr;
          </Link>
        )}
      </Card>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ── Performance Tab ───────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════ */

function PerformanceTab({ data, chartData, totalMessages, totalToolCalls, totalTokens, totalErrors, errorRate7d }: {
  data: AgentData;
  chartData: Array<Record<string, unknown>>;
  totalMessages: number;
  totalToolCalls: number;
  totalTokens: number;
  totalErrors: number;
  errorRate7d: number;
}) {
  return (
    <div className="space-y-5">
      {/* Summary pills */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatPill label="Cost (30d)" value={formatCost(data.cost.cost_30d)} colour="text-[#00D47E]" />
        <StatPill label="Tokens (30d)" value={formatCompact(Number(data.cost.tokens_30d))} colour="text-[#f59e0b]" />
        <StatPill label="Messages (7d)" value={totalMessages} />
        <StatPill label="Error Rate (7d)" value={`${errorRate7d}%`} colour={errorRate7d > 10 ? "text-red-400" : "text-[#8888A0]"} />
      </div>

      {/* Cost chart */}
      {chartData.length > 0 && (
        <Card>
          <SectionTitle title="Daily Cost — 7 Days" />
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E3A" />
              <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="cost" name="Cost ($)" fill="#00D47E" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Token usage chart */}
      {chartData.length > 0 && (
        <Card>
          <SectionTitle title="Token Usage — 7 Days (thousands)" />
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradTokens" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E3A" />
              <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="tokens" name="Tokens (k)" stroke="#f59e0b" strokeWidth={2} fill="url(#gradTokens)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Tool calls */}
      {chartData.length > 0 && totalToolCalls > 0 && (
        <Card>
          <SectionTitle title="Tool Calls — 7 Days" />
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2E2E3A" />
              <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#8888A0", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="tools" name="Tool Calls" fill="#8888A0" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Top tools */}
      {data.topTools.length > 0 && (
        <Card>
          <SectionTitle title="Top Tools (7d)" />
          <div className="space-y-2">
            {data.topTools.map((t) => {
              const maxCount = data.topTools[0]?.call_count ?? 1;
              const pct = Math.round((t.call_count / maxCount) * 100);
              return (
                <div key={t.tool_name} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-sm text-text">{t.tool_name || "(unnamed)"}</span>
                      <span className="ml-2 shrink-0 text-xs font-semibold text-text-dim">{t.call_count}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#2E2E3A]">
                      <div className="h-full rounded-full bg-[#8888A0] transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
/* ── Activity Tab ──────────────────────────────────────── */
/* ═══════════════════════════════════════════════════════════ */

function ActivityTab({
  events,
  filteredEvents,
  eventTypes,
  filter,
  setFilter,
  expandedEvent,
  setExpandedEvent,
}: {
  events: Event[];
  filteredEvents: Event[];
  eventTypes: string[];
  filter: string;
  setFilter: (f: string) => void;
  expandedEvent: string | null;
  setExpandedEvent: (id: string | null) => void;
}) {
  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <SectionTitle title="Event Timeline" note={`${filteredEvents.length} events`} />
        <div className="flex flex-wrap gap-1.5">
          {eventTypes.map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === t ? "bg-[#00D47E] text-[#0A0A0C]" : "border border-[#2E2E3A] text-[#8888A0] hover:text-[#E4E4ED]"}`}
            >
              {t === "all" ? "All" : t.replace("_", " ")}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {filteredEvents.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#8888A0]">
            No events yet. Connect your agent to the Arkon ingest endpoint to start capturing data.
          </div>
        ) : (
          filteredEvents.map((event) => (
            <motion.div
              key={event.id}
              layout
              className={`cursor-pointer rounded-2xl border px-4 py-3 transition ${eventColour(event.event_type)}`}
              onClick={() => setExpandedEvent(expandedEvent === event.id ? null : event.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0">{EVENT_ICON[event.event_type] ?? "\u{1F4CC}"}</span>
                  <span className="text-sm font-semibold text-[#E4E4ED] truncate">
                    {event.event_type.replace(/_/g, " ")}
                  </span>
                  {event.content_redacted && (
                    <span className="shrink-0 rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-400">REDACTED</span>
                  )}
                  {event.threat_level && event.threat_level !== "none" && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                      style={{
                        background: `${SEVERITY_COLORS[event.threat_level]}15`,
                        color: SEVERITY_COLORS[event.threat_level] ?? "#8888A0",
                      }}
                    >
                      {event.threat_level}
                    </span>
                  )}
                </div>
                <div className="shrink-0 text-right text-xs text-[#8888A0]">
                  <div>{fmtTime(event.created_at)}</div>
                  {event.token_estimate > 0 && <div>{event.token_estimate}t</div>}
                </div>
              </div>

              {event.content && (
                <p className="mt-1.5 text-sm text-[#94a3b8] line-clamp-2">
                  {event.content.slice(0, 200)}{event.content.length > 200 ? "\u2026" : ""}
                </p>
              )}

              {expandedEvent === event.id && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="mt-3 rounded-xl border border-[#2E2E3A] bg-[#0A0A0C] p-3"
                >
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs text-[#94a3b8]">
                    {event.content}
                  </pre>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#8888A0]">
                    {event.session_key && <span>Session: {event.session_key}</span>}
                    {event.sender && <span>From: {event.sender}</span>}
                    {event.channel_id && <span>Channel: {event.channel_id}</span>}
                    {event.token_estimate > 0 && <span>~{event.token_estimate} tokens</span>}
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))
        )}
      </div>
    </Card>
  );
}

/* ─── Info Row Helper ─────────────────────────────────────── */

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{label}</p>
      <p className={`mt-0.5 text-sm text-text ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}
