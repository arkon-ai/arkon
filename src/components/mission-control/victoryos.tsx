"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  MessageSquare,
  Zap,
  AlertTriangle,
  Clock,
  Cpu,
  Hash,
  RefreshCw,
  Bot,
  User,
} from "lucide-react";
import { StatCard, ListCard, DetailCard } from "./ui-cards";
import { SectionDescription } from "./dashboard-clarity";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
  PieChart,
  Pie,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────

interface VosOverview {
  summary: {
    total_messages: number;
    user_messages: number;
    assistant_messages: number;
    errors: number;
    interrupted: number;
    delivered: number;
  };
  responseStats: {
    avg_duration_ms: number;
    min_duration_ms: number;
    max_duration_ms: number;
    p95_duration_ms: number;
  };
  tokenUsage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    total_tokens: number;
    model_count: number;
  };
  channelActivity: Array<{
    channel_name: string;
    channel_slug: string;
    message_count: number;
    user_count: number;
    assistant_count: number;
    error_count: number;
    last_message_at: string | null;
  }>;
  modelBreakdown: Array<{
    model: string;
    provider: string;
    message_count: number;
    avg_duration_ms: number;
    total_tokens: number;
  }>;
  hourlyPattern: Array<{
    hour: number;
    count: number;
    user_count: number;
    assistant_count: number;
  }>;
  dailyVolume: Array<{
    day: string;
    total: number;
    user_msgs: number;
    assistant_msgs: number;
    errors: number;
  }>;
  recentMessages: Array<{
    id: string;
    role: string;
    content_preview: string;
    status: string;
    metadata: Record<string, unknown>;
    created_at: string;
    channel_name: string;
    channel_slug: string;
  }>;
  recentErrors: Array<{
    id: string;
    content_preview: string;
    status: string;
    metadata: Record<string, unknown>;
    created_at: string;
    channel_name: string;
  }>;
  range: string;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

async function apiFetch<T>(url: string): Promise<T> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-csrf-token": decodeURIComponent(csrf) },
  });
  if (res.status === 401) {
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const RANGE_OPTIONS = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

const CHANNEL_COLORS: Record<string, string> = {
  lumina: "#22C55E",
  forge: "#3B82F6",
  atlas: "#00D47E",
  shepherd: "#F59E0B",
  axel: "#EF4444",
  kairos: "#06B6D4",
  pax: "#EC4899",
  sage: "#10B981",
  zara: "#F97316",
  scout: "#6366F1",
};

const PIE_COLORS = ["#22C55E", "#3B82F6", "#00D47E", "#F59E0B", "#06B6D4"];

// ─── Component ───────────────────────────────────────────────────

export default function VictoryOSScreen() {
  const [data, setData] = useState<VosOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("7d");

  const fetchData = (r: string) => {
    setLoading(true);
    setError(null);
    apiFetch<VosOverview>(`/api/victoryos/overview?range=${r}`)
      .then(setData)
      .catch((e) => {
        setError(String(e));
        toast.error("Failed to load VictoryOS data");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData(range);
  }, [range]);

  // Fill hourly chart with all 24 hours
  const hourlyData = useMemo(() => {
    if (!data) return [];
    const map = new Map(data.hourlyPattern.map((h) => [h.hour, h]));
    return Array.from({ length: 24 }, (_, i) => ({
      hour: `${i.toString().padStart(2, "0")}:00`,
      user: map.get(i)?.user_count ?? 0,
      assistant: map.get(i)?.assistant_count ?? 0,
    }));
  }, [data]);

  const errorRate = data
    ? data.summary.total_messages > 0
      ? ((data.summary.errors + data.summary.interrupted) / data.summary.total_messages * 100).toFixed(1)
      : "0"
    : "0";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">VictoryOS</h1>
          <SectionDescription id="vos-overview">
            Chat engine metrics, token usage, and agent activity.
          </SectionDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  range === opt.value
                    ? "bg-[rgba(0,212,126,0.1)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => fetchData(range)}
            disabled={loading}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-[var(--bg-surface-2)]/30" />
          ))}
        </div>
      ) : data ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Stat Cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Messages"
              value={data.summary.total_messages}
              subtitle={`${data.summary.user_messages} user / ${data.summary.assistant_messages} assistant`}
              icon={MessageSquare}
            />
            <StatCard
              label="Avg Response Time"
              value={formatMs(data.responseStats.avg_duration_ms)}
              subtitle={`p95: ${formatMs(data.responseStats.p95_duration_ms)}`}
              icon={Clock}
            />
            <StatCard
              label="Total Tokens"
              value={formatTokens(Number(data.tokenUsage.total_tokens))}
              subtitle={`${formatTokens(Number(data.tokenUsage.input_tokens))} in / ${formatTokens(Number(data.tokenUsage.output_tokens))} out`}
              icon={Zap}
            />
            <StatCard
              label="Error Rate"
              value={`${errorRate}%`}
              subtitle={`${data.summary.errors} errors, ${data.summary.interrupted} interrupted`}
              icon={AlertTriangle}
              className={
                Number(errorRate) > 10
                  ? "border-[var(--danger)]/30"
                  : ""
              }
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Daily Volume */}
            <DetailCard title="Message Volume" icon={MessageSquare}>
              {data.dailyVolume.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={data.dailyVolume}>
                    <defs>
                      <linearGradient id="gradUser" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="gradAssistant" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#22C55E" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#22C55E" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                    <XAxis
                      dataKey="day"
                      stroke="#8888A0"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: string) => {
                        const d = new Date(v);
                        return `${d.getMonth() + 1}/${d.getDate()}`;
                      }}
                    />
                    <YAxis stroke="#8888A0" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        background: "#111118",
                        border: "1px solid #1E1E2A",
                        borderRadius: "12px",
                        fontSize: "12px",
                      }}
                      labelFormatter={(v) => new Date(String(v)).toLocaleDateString()}
                    />
                    <Area
                      type="monotone"
                      dataKey="user_msgs"
                      name="User"
                      stroke="#3B82F6"
                      fillOpacity={1}
                      fill="url(#gradUser)"
                    />
                    <Area
                      type="monotone"
                      dataKey="assistant_msgs"
                      name="Assistant"
                      stroke="#22C55E"
                      fillOpacity={1}
                      fill="url(#gradAssistant)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">No data in range</p>
              )}
            </DetailCard>

            {/* Hourly Pattern */}
            <DetailCard title="Activity by Hour (SAST)" icon={Clock}>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={hourlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" />
                  <XAxis
                    dataKey="hour"
                    stroke="#8888A0"
                    tick={{ fontSize: 10 }}
                    interval={3}
                  />
                  <YAxis stroke="#8888A0" tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{
                      background: "#111118",
                      border: "1px solid #1E1E2A",
                      borderRadius: "12px",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="user" name="User" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="assistant" name="Assistant" fill="#22C55E" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </DetailCard>
          </div>

          {/* Channel Activity + Model Breakdown */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Channel Activity */}
            <ListCard title="Channel Activity" icon={Hash}>
              <div className="space-y-2">
                {data.channelActivity.map((ch) => {
                  const color = CHANNEL_COLORS[ch.channel_slug] ?? "#8888A0";
                  const maxCount = Math.max(
                    ...data.channelActivity.map((c) => c.message_count),
                    1
                  );
                  const pct = (ch.message_count / maxCount) * 100;
                  return (
                    <div key={ch.channel_slug} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-medium text-[var(--text-primary)]">{ch.channel_name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                          <span>{ch.message_count} msgs</span>
                          {ch.error_count > 0 && (
                            <span className="text-[var(--danger)]">{ch.error_count} err</span>
                          )}
                          {ch.last_message_at && (
                            <span className="text-[10px]">{timeAgo(ch.last_message_at)}</span>
                          )}
                        </div>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: color,
                            opacity: 0.7,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
                {data.channelActivity.length === 0 && (
                  <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">No channel activity</p>
                )}
              </div>
            </ListCard>

            {/* Model Breakdown */}
            <DetailCard title="Model Usage" icon={Cpu}>
              {data.modelBreakdown.length > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="w-[140px] shrink-0">
                    <ResponsiveContainer width="100%" height={140}>
                      <PieChart>
                        <Pie
                          data={data.modelBreakdown}
                          dataKey="message_count"
                          nameKey="model"
                          cx="50%"
                          cy="50%"
                          innerRadius={35}
                          outerRadius={60}
                          strokeWidth={0}
                        >
                          {data.modelBreakdown.map((_, i) => (
                            <Cell
                              key={i}
                              fill={PIE_COLORS[i % PIE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#111118",
                            border: "1px solid #1E1E2A",
                            borderRadius: "12px",
                            fontSize: "12px",
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {data.modelBreakdown.map((m, i) => (
                      <div key={m.model} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="text-[var(--text-primary)]">{m.model}</span>
                        </div>
                        <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                          <span>{m.message_count} msgs</span>
                          <span>{formatMs(m.avg_duration_ms)} avg</span>
                          <span>{formatTokens(Number(m.total_tokens))} tok</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">No model data yet</p>
              )}
            </DetailCard>
          </div>

          {/* Recent Messages + Errors */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Recent Messages */}
            <ListCard title="Recent Messages" icon={MessageSquare}>
              <div className="space-y-1">
                {data.recentMessages.map((msg) => (
                  <div
                    key={msg.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.02]"
                  >
                    <div className="mt-0.5 shrink-0">
                      {msg.role === "user" ? (
                        <User className="h-3.5 w-3.5 text-[var(--info)]" />
                      ) : (
                        <Bot className="h-3.5 w-3.5 text-[var(--success)]" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                          {msg.channel_slug}
                        </span>
                        {msg.status === "error" && (
                          <span className="rounded bg-[var(--danger)]/10 px-1 py-0.5 text-[9px] font-semibold text-[var(--danger)]">
                            ERROR
                          </span>
                        )}
                        {msg.status === "interrupted" && (
                          <span className="rounded bg-[var(--warning)]/10 px-1 py-0.5 text-[9px] font-semibold text-[var(--warning)]">
                            INTERRUPTED
                          </span>
                        )}
                        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">
                          {timeAgo(msg.created_at)}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                        {msg.content_preview || "(empty)"}
                      </p>
                    </div>
                  </div>
                ))}
                {data.recentMessages.length === 0 && (
                  <p className="py-4 text-center text-sm text-[var(--text-tertiary)]">No messages yet</p>
                )}
              </div>
            </ListCard>

            {/* Recent Errors */}
            <ListCard title="Recent Errors" icon={AlertTriangle}>
              <div className="space-y-1">
                {data.recentErrors.map((err) => (
                  <div
                    key={err.id}
                    className="rounded-lg border border-[var(--danger)]/10 px-3 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-[var(--text-primary)]">
                        {err.channel_name}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                            err.status === "error"
                              ? "bg-[var(--danger)]/10 text-[var(--danger)]"
                              : "bg-[var(--warning)]/10 text-[var(--warning)]"
                          }`}
                        >
                          {err.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                          {timeAgo(err.created_at)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-xs text-[var(--text-secondary)]">
                      {err.content_preview || "(no content)"}
                    </p>
                  </div>
                ))}
                {data.recentErrors.length === 0 && (
                  <p className="py-4 text-center text-sm text-[var(--success)]">No errors</p>
                )}
              </div>
            </ListCard>
          </div>

          {/* Token Usage Breakdown */}
          <DetailCard title="Token Breakdown" icon={Zap}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              {[
                { label: "Input", value: Number(data.tokenUsage.input_tokens), color: "#3B82F6" },
                { label: "Output", value: Number(data.tokenUsage.output_tokens), color: "#22C55E" },
                { label: "Cache Read", value: Number(data.tokenUsage.cache_read_tokens), color: "#00D47E" },
                { label: "Cache Write", value: Number(data.tokenUsage.cache_write_tokens), color: "#F59E0B" },
                { label: "Total", value: Number(data.tokenUsage.total_tokens), color: "#00D47E" },
              ].map((t) => (
                <div key={t.label} className="text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
                    {t.label}
                  </p>
                  <p className="mt-1 text-lg font-bold" style={{ color: t.color }}>
                    {formatTokens(t.value)}
                  </p>
                </div>
              ))}
            </div>
          </DetailCard>
        </motion.div>
      ) : null}
    </div>
  );
}
