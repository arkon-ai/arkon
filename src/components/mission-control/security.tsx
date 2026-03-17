"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CardEntranceWrapper, PulsingDot, SkeletonCard, StatCountUp } from "@/components/mission-control/charts";
import { ShellHeader } from "@/components/mission-control/dashboard";
import { formatCompact, timeAgo, usePollingFetch } from "@/components/mission-control/api";

/* ─── Types ─────────────────────────────────────────────── */

interface SeverityCount {
  threat_level: string;
  count: number;
}

interface ClassCount {
  threat_class: string;
  count: number;
}

interface TimelineDay {
  day: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

interface ThreatEvent {
  id: string;
  agent_id: string;
  agent_name: string | null;
  event_type: string;
  direction: string | null;
  channel_id: string | null;
  sender: string | null;
  content: string;
  threat_level: string;
  threat_classes: string | string[];
  threat_matches: string | Array<{ class: string; pattern: string; excerpt: string }>;
  created_at: string;
}

interface TopAgent {
  agent_name: string;
  threat_count: number;
  severe_count: number;
}

interface SecurityData {
  severityBreakdown: SeverityCount[];
  classDistribution: ClassCount[];
  timeline: TimelineDay[];
  events: ThreatEvent[];
  topAgents: TopAgent[];
  totalEvents: { total: number; threats: number };
  range: string;
  timestamp: string;
}

/* ─── Helpers ───────────────────────────────────────────── */

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; label: string }> = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.1)", label: "CRITICAL" },
  high: { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: "HIGH" },
  medium: { color: "#8b5cf6", bg: "rgba(139,92,246,0.1)", label: "MEDIUM" },
  low: { color: "#64748b", bg: "rgba(100,116,139,0.1)", label: "LOW" },
};

const CLASS_LABELS: Record<string, string> = {
  prompt_injection: "Prompt Injection",
  shell_command: "Shell Command",
  credential_leak: "Credential Leak",
};

const CLASS_COLORS: Record<string, string> = {
  prompt_injection: "#ef4444",
  shell_command: "#f59e0b",
  credential_leak: "#8b5cf6",
};

function parseJsonField<T>(value: string | T): T {
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return [] as unknown as T; }
  }
  return value;
}

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

/* ─── Chart Tooltip ─────────────────────────────────────── */

function SecurityTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[#64748b]">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value}
        </p>
      ))}
    </div>
  );
}

/* ─── Components ────────────────────────────────────────── */

function SeverityCards({ data }: { data: SeverityCount[] }) {
  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const row of data) {
    counts[row.threat_level] = row.count;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {(["critical", "high", "medium", "low"] as const).map((level, i) => {
        const config = SEVERITY_CONFIG[level];
        return (
          <CardEntranceWrapper key={level} index={i}>
            <div
              className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-4 card-hover"
              style={{ borderTopColor: config.color, borderTopWidth: 2 }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: config.color }}>
                {config.label}
              </p>
              <p className="mt-2 text-2xl font-bold text-text">
                <StatCountUp value={counts[level]} />
              </p>
            </div>
          </CardEntranceWrapper>
        );
      })}
    </div>
  );
}

function ThreatTimeline({ data }: { data: TimelineDay[] }) {
  const chartData = data.map((d) => ({
    ...d,
    day: formatDay(d.day),
  }));

  return (
    <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-4">
      <p className="mb-3 text-sm font-semibold text-text">Threat Timeline</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="critGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="highGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="medGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<SecurityTooltip />} />
          <Area type="monotone" dataKey="critical" stackId="1" stroke="#ef4444" fill="url(#critGrad)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="high" stackId="1" stroke="#f59e0b" fill="url(#highGrad)" strokeWidth={1.5} dot={false} />
          <Area type="monotone" dataKey="medium" stackId="1" stroke="#8b5cf6" fill="url(#medGrad)" strokeWidth={1.5} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function ClassBreakdown({ data }: { data: ClassCount[] }) {
  const chartData = data.map((d) => ({
    name: CLASS_LABELS[d.threat_class] ?? d.threat_class,
    count: d.count,
    color: CLASS_COLORS[d.threat_class] ?? "#64748b",
  }));

  return (
    <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-4">
      <p className="mb-3 text-sm font-semibold text-text">Threat Classes</p>
      {chartData.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-dim">No threats detected in this period</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" horizontal={false} />
            <XAxis dataKey="name" tick={{ fill: "#94a3b8", fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip content={<SecurityTooltip />} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function TopAgentsCard({ data }: { data: TopAgent[] }) {
  if (data.length === 0) return null;

  return (
    <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-4">
      <p className="mb-3 text-sm font-semibold text-text">Most Targeted Agents</p>
      <div className="space-y-2">
        {data.map((agent) => (
          <div key={agent.agent_name} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2">
            <span className="text-sm text-text">{agent.agent_name}</span>
            <div className="flex items-center gap-3">
              {agent.severe_count > 0 && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(239,68,68,0.15)", color: "#ef4444" }}>
                  {agent.severe_count} severe
                </span>
              )}
              <span className="text-sm font-semibold text-text-dim">{agent.threat_count}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ThreatHealthBar({ total, threats }: { total: number; threats: number }) {
  const cleanPct = total > 0 ? Math.round(((total - threats) / total) * 100) : 100;
  const threatPct = total > 0 ? Math.round((threats / total) * 100) : 0;

  return (
    <CardEntranceWrapper index={4}>
      <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Event Health</p>
            <p className="mt-1 text-lg font-bold text-text">
              {cleanPct}% <span className="text-sm font-normal text-text-dim">clean</span>
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-text-dim">{formatCompact(total)} total events</p>
            <p className="text-sm" style={{ color: threats > 0 ? "#ef4444" : "#22c55e" }}>
              {formatCompact(threats)} flagged
            </p>
          </div>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[#1a2a4a]">
          <div className="rounded-full bg-green transition-all" style={{ width: `${cleanPct}%` }} />
          {threatPct > 0 && (
            <div className="rounded-full bg-red transition-all" style={{ width: `${threatPct}%` }} />
          )}
        </div>
      </div>
    </CardEntranceWrapper>
  );
}

function ThreatEventRow({ event }: { event: ThreatEvent }) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[event.threat_level] ?? SEVERITY_CONFIG.low;
  const classes = parseJsonField<string[]>(event.threat_classes);
  const matches = parseJsonField<Array<{ class: string; pattern: string; excerpt: string }>>(event.threat_matches);

  return (
    <div className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] transition card-hover">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <PulsingDot status={event.threat_level === "critical" ? "error" : event.threat_level === "high" ? "warm" : "idle"} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: config.bg, color: config.color }}
            >
              {config.label}
            </span>
            {classes.map((cls) => (
              <span key={cls} className="text-[10px] text-text-dim">
                {CLASS_LABELS[cls] ?? cls}
              </span>
            ))}
          </div>
          <p className="mt-1 truncate text-sm text-text">
            {event.agent_name ?? `Agent ${event.agent_id}`}
            <span className="mx-2 text-text-dim">&middot;</span>
            <span className="text-text-dim">{event.event_type}</span>
            {event.channel_id && (
              <>
                <span className="mx-2 text-text-dim">&middot;</span>
                <span className="text-text-dim">{event.channel_id}</span>
              </>
            )}
          </p>
        </div>
        <span className="shrink-0 text-xs text-text-dim">{timeAgo(event.created_at)}</span>
        <span className="shrink-0 text-text-dim">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {expanded && (
        <div className="border-t border-[#1a2a4a] px-4 py-3">
          {matches.length > 0 && (
            <div className="mb-3 space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Pattern Matches</p>
              {matches.map((match, i) => (
                <div key={i} className="rounded-lg bg-white/[0.02] px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ background: CLASS_COLORS[match.class] + "22", color: CLASS_COLORS[match.class] ?? "#64748b" }}>
                      {match.class}
                    </span>
                    <span className="text-xs font-medium text-text">{match.pattern}</span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-text-dim break-all">{match.excerpt}</p>
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Content</p>
            <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-white/[0.02] p-3 font-mono text-xs text-text-dim">
              {event.content || "(empty)"}
            </pre>
          </div>
          <div className="mt-2 flex gap-4 text-[11px] text-text-dim">
            <span>ID: {event.id}</span>
            <span>Sender: {event.sender ?? "unknown"}</span>
            <span>{new Date(event.created_at).toLocaleString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */

export function SecurityScreen() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [severityFilter, setSeverityFilter] = useState<string>("");
  const [classFilter, setClassFilter] = useState<string>("");

  const params = new URLSearchParams({ range });
  if (severityFilter) params.set("severity", severityFilter);
  if (classFilter) params.set("class", classFilter);

  const { data, loading, error } = usePollingFetch<SecurityData>(
    `/api/security/overview?${params}`,
    30000
  );

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <ShellHeader
          title="ThreatGuard"
          subtitle="Security posture and threat intelligence"
          gradient
        />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={1} height="h-10" />)}
        </div>
        <SkeletonCard lines={2} height="h-48" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-5">
        <ShellHeader title="ThreatGuard" subtitle="Security posture and threat intelligence" gradient />
        <div className="rounded-2xl border border-red/40 bg-red/5 p-6 text-center">
          <p className="text-sm text-red">Failed to load security data: {error}</p>
        </div>
      </div>
    );
  }

  const {
    severityBreakdown = [],
    classDistribution = [],
    timeline = [],
    events = [],
    topAgents = [],
    totalEvents = { total: 0, threats: 0 },
  } = data ?? {};

  return (
    <div className="space-y-5">
      <ShellHeader
        title="ThreatGuard"
        subtitle="Security posture and threat intelligence"
        gradient
        action={
          <div className="flex gap-2">
            {(["24h", "7d", "30d"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  range === r
                    ? "bg-cyan/15 text-cyan"
                    : "text-text-dim hover:bg-white/5 hover:text-text"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      {/* Severity Cards */}
      <SeverityCards data={severityBreakdown} />

      {/* Health Bar */}
      <ThreatHealthBar total={totalEvents.total} threats={totalEvents.threats} />

      {/* Charts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <CardEntranceWrapper index={5}>
          <ThreatTimeline data={timeline} />
        </CardEntranceWrapper>
        <CardEntranceWrapper index={6}>
          <ClassBreakdown data={classDistribution} />
        </CardEntranceWrapper>
      </div>

      {/* Top Agents */}
      <CardEntranceWrapper index={7}>
        <TopAgentsCard data={topAgents} />
      </CardEntranceWrapper>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="rounded-lg border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-sm text-text"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="rounded-lg border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-sm text-text"
        >
          <option value="">All Classes</option>
          <option value="prompt_injection">Prompt Injection</option>
          <option value="shell_command">Shell Command</option>
          <option value="credential_leak">Credential Leak</option>
        </select>
      </div>

      {/* Threat Events List */}
      <div>
        <p className="mb-3 text-sm font-semibold text-text">
          Recent Threat Events
          <span className="ml-2 text-text-dim">({events.length})</span>
        </p>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-8 text-center">
            <p className="text-3xl">&#x1F6E1;</p>
            <p className="mt-2 text-sm font-semibold text-text">All Clear</p>
            <p className="mt-1 text-xs text-text-dim">No threats detected in this period</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <ThreatEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
