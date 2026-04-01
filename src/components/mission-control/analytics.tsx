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
import { CardEntranceWrapper, SkeletonCard, StatCountUp } from "@/components/mission-control/charts";
import { ShellHeader } from "@/components/mission-control/dashboard";
import { formatCompact, timeAgo, usePollingFetch } from "@/components/mission-control/api";
import { SectionDescription } from "@/components/mission-control/dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

/* ─── Types ─────────────────────────────────────────────── */

interface VolumeByType {
  event_type: string;
  count: number;
}

interface VolumeByChannel {
  channel: string;
  count: number;
  inbound: number;
  outbound: number;
}

interface HourlyPoint {
  hour: number;
  count: number;
}

interface DailyVolume {
  day: string;
  total: number;
  received: number;
  sent: number;
  tool_calls: number;
  errors: number;
}

interface AgentBreakdown {
  agent_name: string;
  agent_id: string;
  total_events: number;
  received: number;
  sent: number;
  tool_calls: number;
  errors: number;
  total_tokens: string;
  last_active: string;
}

interface SessionStats {
  total_sessions: number;
  avg_messages_per_session: number;
  max_messages_in_session: number;
  active_sessions: number;
}

interface TopSender {
  sender_name: string;
  channel: string;
  message_count: number;
}

interface ToolCall {
  tool_name: string;
  call_count: number;
  avg_duration_ms: number;
  failures: number;
}

interface AnalyticsData {
  volumeByType: VolumeByType[];
  volumeByChannel: VolumeByChannel[];
  hourlyPattern: HourlyPoint[];
  dailyVolume: DailyVolume[];
  agentBreakdown: AgentBreakdown[];
  sessionStats: SessionStats;
  topSenders: TopSender[];
  directionRatio: { inbound: number; outbound: number; untagged: number };
  toolCalls: ToolCall[];
  totals: { total_events: number; active_agents: number; unique_sessions: number; total_tokens: string };
  range: string;
  timestamp: string;
}

/* ─── Helpers ───────────────────────────────────────────── */

const CHANNEL_COLORS: Record<string, string> = {
  discord: "#5865F2",
  telegram: "#0088cc",
  whatsapp: "#25D366",
  unknown: "#8888A0",
};

const EVENT_TYPE_COLORS: Record<string, string> = {
  message_received: "#00D47E",
  message_sent: "#00D47E",
  tool_call: "#f59e0b",
  error: "#ef4444",
  cron: "#3b82f6",
  system: "#8888A0",
  note: "#8888A0",
};

function formatDay(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en", { month: "short", day: "numeric" });
}

function formatHour(hour: number) {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

/* ─── Tooltip ───────────────────────────────────────────── */

function AnalyticsTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[var(--text-secondary)]">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} className="font-semibold" style={{ color: entry.color }}>
          {entry.name}: {entry.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

/* ─── Summary Cards ─────────────────────────────────────── */

function SummaryCards({ totals, sessionStats }: { totals: AnalyticsData["totals"]; sessionStats: SessionStats }) {
  const stats = [
    { label: "Total Events", value: totals.total_events, color: "#00D47E" },
    { label: "Active Agents", value: totals.active_agents, color: "#00D47E" },
    { label: "Sessions", value: totals.unique_sessions, color: "#3b82f6" },
    { label: "Tokens Used", value: Number(totals.total_tokens), color: "#f59e0b", format: true },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat, i) => (
        <CardEntranceWrapper key={stat.label} index={i}>
          <div
            className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 card-hover"
            style={{ borderTopColor: stat.color, borderTopWidth: 2 }}
          >
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">{stat.label}</p>
            <p className="mt-2 text-2xl font-bold text-text">
              {stat.format ? formatCompact(stat.value) : <StatCountUp value={stat.value} />}
            </p>
          </div>
        </CardEntranceWrapper>
      ))}
    </div>
  );
}

/* ─── Daily Volume Chart ────────────────────────────────── */

function DailyVolumeChart({ data }: { data: DailyVolume[] }) {
  const chartData = data.map((d) => ({ ...d, day: formatDay(d.day) }));

  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Daily Volume</p>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
          <defs>
            <linearGradient id="recvGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00D47E" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00D47E" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00D47E" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00D47E" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" vertical={false} />
          <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip content={<AnalyticsTooltip />} />
          <Area type="monotone" dataKey="received" name="Received" stroke="#00D47E" fill="url(#recvGrad)" strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="sent" name="Sent" stroke="#00D47E" fill="url(#sentGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
      <div className="mt-2 flex justify-center gap-4 text-xs">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />Received</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />Sent</span>
      </div>
    </div>
  );
}

/* ─── Hourly Heatmap ────────────────────────────────────── */

function HourlyHeatmap({ data }: { data: HourlyPoint[] }) {
  // Fill all 24 hours
  const full: HourlyPoint[] = Array.from({ length: 24 }, (_, i) => {
    const found = data.find((d) => d.hour === i);
    return { hour: i, count: found?.count ?? 0 };
  });
  const maxCount = Math.max(...full.map((d) => d.count), 1);

  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Activity by Hour (UTC)</p>
      <div className="flex items-end gap-1" style={{ height: 120 }}>
        {full.map((point) => {
          const heightPct = (point.count / maxCount) * 100;
          const opacity = 0.2 + (point.count / maxCount) * 0.8;
          return (
            <div key={point.hour} className="group relative flex-1" style={{ height: "100%" }}>
              <div
                className="absolute bottom-0 w-full rounded-t transition-all"
                style={{
                  height: `${Math.max(heightPct, 2)}%`,
                  backgroundColor: `rgba(0, 212, 126, ${opacity})`,
                }}
              />
              <div className="absolute -top-6 left-1/2 -translate-x-1/2 rounded bg-[var(--bg-surface)] px-1.5 py-0.5 text-[9px] text-text opacity-0 transition group-hover:opacity-100 whitespace-nowrap border border-[var(--border)]">
                {formatHour(point.hour)}: {point.count}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-[9px] text-text-dim">
        <span>12a</span>
        <span>6a</span>
        <span>12p</span>
        <span>6p</span>
        <span>11p</span>
      </div>
    </div>
  );
}

/* ─── Channel Breakdown ─────────────────────────────────── */

function ChannelBreakdown({ data }: { data: VolumeByChannel[] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Volume by Channel</p>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-dim">No channel data</p>
      ) : (
        <div className="space-y-3">
          {data.map((ch) => {
            const pct = total > 0 ? (ch.count / total) * 100 : 0;
            const color = CHANNEL_COLORS[ch.channel] ?? "#8888A0";
            return (
              <div key={ch.channel}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-text capitalize">{ch.channel}</span>
                  <span className="text-text-dim">{ch.count.toLocaleString()} ({pct.toFixed(0)}%)</span>
                </div>
                <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
                  <div className="rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
                <div className="mt-1 flex gap-3 text-[10px] text-text-dim">
                  <span>{ch.inbound} in</span>
                  <span>{ch.outbound} out</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Agent Activity Table ──────────────────────────────── */

function AgentTable({ data }: { data: AgentBreakdown[] }) {
  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 overflow-x-auto">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Agent Activity</p>
      {data.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-dim">No agent data</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-dim">
              <th className="pb-2 pr-4">Agent</th>
              <th className="pb-2 pr-4 text-right">Recv</th>
              <th className="pb-2 pr-4 text-right">Sent</th>
              <th className="pb-2 pr-4 text-right">Tools</th>
              <th className="pb-2 pr-4 text-right">Errors</th>
              <th className="pb-2 pr-4 text-right">Tokens</th>
              <th className="pb-2 text-right">Last Active</th>
            </tr>
          </thead>
          <tbody className="text-text">
            {data.map((agent) => (
              <tr key={agent.agent_id} className="border-t border-[var(--border)]/50">
                <td className="py-2.5 pr-4 font-medium">{agent.agent_name}</td>
                <td className="py-2.5 pr-4 text-right text-[var(--accent)]">{agent.received}</td>
                <td className="py-2.5 pr-4 text-right text-[var(--accent)]">{agent.sent}</td>
                <td className="py-2.5 pr-4 text-right text-[var(--warning)]">{agent.tool_calls}</td>
                <td className="py-2.5 pr-4 text-right text-[var(--danger)]">{agent.errors}</td>
                <td className="py-2.5 pr-4 text-right text-text-dim">{formatCompact(Number(agent.total_tokens))}</td>
                <td className="py-2.5 text-right text-text-dim">{timeAgo(agent.last_active)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Direction Ratio ───────────────────────────────────── */

function DirectionRatio({ data }: { data: { inbound: number; outbound: number; untagged: number } }) {
  const total = data.inbound + data.outbound + data.untagged;
  const inPct = total > 0 ? (data.inbound / total) * 100 : 50;
  const outPct = total > 0 ? (data.outbound / total) * 100 : 50;

  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Message Direction</p>
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <div className="flex h-4 overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
            <div className="rounded-l-full bg-[var(--accent)] transition-all" style={{ width: `${inPct}%` }} />
            <div className="rounded-r-full bg-[var(--accent)] transition-all" style={{ width: `${outPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs">
            <span className="text-[var(--accent)]">{data.inbound.toLocaleString()} inbound ({inPct.toFixed(0)}%)</span>
            <span className="text-[var(--accent)]">{data.outbound.toLocaleString()} outbound ({outPct.toFixed(0)}%)</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Top Senders ───────────────────────────────────────── */

function TopSendersCard({ data }: { data: TopSender[] }) {
  if (data.length === 0) return null;

  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Top Senders</p>
      <div className="space-y-2">
        {data.map((sender, i) => {
          const color = CHANNEL_COLORS[sender.channel] ?? "#8888A0";
          return (
            <div key={`${sender.sender_name}-${sender.channel}-${i}`} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text">{sender.sender_name}</span>
                <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold capitalize" style={{ background: color + "22", color }}>
                  {sender.channel}
                </span>
              </div>
              <span className="text-sm font-semibold text-text-dim">{sender.message_count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Session Stats Card ────────────────────────────────── */

function SessionStatsCard({ data }: { data: SessionStats }) {
  const stats = [
    { label: "Total Sessions", value: data.total_sessions },
    { label: "Active Now", value: data.active_sessions },
    { label: "Avg Messages/Session", value: data.avg_messages_per_session },
    { label: "Max in Single Session", value: data.max_messages_in_session },
  ];

  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-3 text-sm font-semibold text-text">Session Analytics</p>
      <div className="grid grid-cols-2 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-xl bg-white/[0.02] px-3 py-2">
            <p className="text-[10px] uppercase tracking-wide text-text-dim">{stat.label}</p>
            <p className="mt-1 text-lg font-bold text-text"><StatCountUp value={stat.value} /></p>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Tool Calls Section ────────────────────────────────── */

function ToolCallsCard({ data }: { data: ToolCall[] }) {
  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="mb-1 text-sm font-semibold text-text">Tool Calls</p>
      <p className="mb-3 text-[11px] text-text-dim">Agent tool invocations and performance</p>
      {data.length === 0 ? (
        <div className="rounded-xl bg-white/[0.02] px-4 py-6 text-center">
          <p className="text-2xl">&#x1F527;</p>
          <p className="mt-2 text-sm text-text-dim">No tool call data yet</p>
          <p className="mt-1 text-[11px] text-text-dim">Tool calls will appear here once agents start reporting them</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-text-dim">
              <th className="pb-2 pr-4">Tool</th>
              <th className="pb-2 pr-4 text-right">Calls</th>
              <th className="pb-2 pr-4 text-right">Avg ms</th>
              <th className="pb-2 text-right">Failures</th>
            </tr>
          </thead>
          <tbody className="text-text">
            {data.map((tool) => (
              <tr key={tool.tool_name} className="border-t border-[var(--border)]/50">
                <td className="py-2 pr-4 font-mono text-xs">{tool.tool_name}</td>
                <td className="py-2 pr-4 text-right">{tool.call_count}</td>
                <td className="py-2 pr-4 text-right text-text-dim">{tool.avg_duration_ms}ms</td>
                <td className="py-2 text-right">
                  {tool.failures > 0 ? (
                    <span className="text-red">{tool.failures}</span>
                  ) : (
                    <span className="text-text-dim">0</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ─── Main Page ─────────────────────────────────────────── */

export function AnalyticsScreen() {
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");

  const { data, loading, error } = usePollingFetch<AnalyticsData>(
    `/api/analytics/overview?range=${range}`,
    30000
  );

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <ShellHeader title="Analytics" subtitle="Event intelligence and usage patterns" gradient />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} lines={1} height="h-10" />)}
        </div>
        <SkeletonCard lines={2} height="h-48" />
        <SkeletonCard lines={2} height="h-48" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-5">
        <ShellHeader title="Analytics" subtitle="Event intelligence and usage patterns" gradient />
        <div className="rounded-2xl border border-red/40 bg-red/5 p-6 text-center">
          <p className="text-sm text-red">Failed to load analytics: {error}</p>
        </div>
      </div>
    );
  }

  const {
    volumeByChannel = [],
    hourlyPattern = [],
    dailyVolume = [],
    agentBreakdown = [],
    sessionStats = { total_sessions: 0, avg_messages_per_session: 0, max_messages_in_session: 0, active_sessions: 0 },
    topSenders = [],
    directionRatio = { inbound: 0, outbound: 0, untagged: 0 },
    toolCalls = [],
    totals = { total_events: 0, active_agents: 0, unique_sessions: 0, total_tokens: "0" },
  } = data ?? {};

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Analytics"
        subtitle="Event intelligence and usage patterns"
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

      <SectionDescription id="anomaly-detection">
        Anomaly detection monitors your agent event rates and alerts you when something unusual
        happens &mdash; sudden spikes in activity, unexpected silence, or abnormal token consumption
        compared to the baseline.
      </SectionDescription>

      {/* Summary Cards */}
      <SummaryCards totals={totals} sessionStats={sessionStats} />

      {/* Direction Ratio */}
      <CardEntranceWrapper index={4}>
        <DirectionRatio data={directionRatio} />
      </CardEntranceWrapper>

      {/* Charts Row: Daily Volume + Hourly Heatmap */}
      <div className="grid gap-4 md:grid-cols-2">
        <CardEntranceWrapper index={5}>
          <DailyVolumeChart data={dailyVolume} />
        </CardEntranceWrapper>
        <CardEntranceWrapper index={6}>
          <HourlyHeatmap data={hourlyPattern} />
        </CardEntranceWrapper>
      </div>

      {/* Channel + Sessions Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <CardEntranceWrapper index={7}>
          <ChannelBreakdown data={volumeByChannel} />
        </CardEntranceWrapper>
        <CardEntranceWrapper index={8}>
          <SessionStatsCard data={sessionStats} />
        </CardEntranceWrapper>
      </div>

      {/* Agent Table */}
      <CardEntranceWrapper index={9}>
        <AgentTable data={agentBreakdown} />
      </CardEntranceWrapper>

      {/* Top Senders + Tool Calls */}
      <div className="grid gap-4 md:grid-cols-2">
        <CardEntranceWrapper index={10}>
          <TopSendersCard data={topSenders} />
        </CardEntranceWrapper>
        <CardEntranceWrapper index={11}>
          <ToolCallsCard data={toolCalls} />
        </CardEntranceWrapper>
      </div>
    </div>
  );
}
