"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  Download,
  ExternalLink,
  Filter,
  Search,
  User,
  Wrench,
  X,
} from "lucide-react";
import {
  Button,
  Card,
  PageHeader,
  PulseStrip,
  SectionTitle,
  StatusPill,
  Tabs,
} from "./ui-cards";
import { Avatar } from "./agents-kit";
import { formatMs, formatTokens } from "@/lib/time-format";

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
  hourlyByChannel: Array<{
    channel_slug: string;
    channel_name: string;
    hour: number;
    count: number;
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
    channel_slug?: string;
  }>;
  range: string;
  timestamp: string;
}

// ─── Helpers ─────────────────────────────────────────────────────

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

// Brand bible §3.6 persona palette LOCKED.
// warden=emerald · codesmith=slate · lumina=amber · sentinel=teal.
// Channels outside the persona set get a neutral var(--text-secondary).
function personaFor(channelSlug: string | undefined): string | undefined {
  switch ((channelSlug || "").toLowerCase()) {
    case "warden":
    case "codesmith":
    case "lumina":
    case "sentinel":
      return channelSlug as string;
    default:
      return undefined;
  }
}

const RANGE_OPTIONS = [
  { id: "24h", label: "24h" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

// Filter-bar activity-kind tabs. Visual-only for PR-9a; wiring deferred.
const STREAM_KIND_OPTIONS = [
  { id: "all", label: "All" },
  { id: "errors", label: "Errors" },
  { id: "tool_calls", label: "Tool calls" },
  { id: "messages", label: "Messages" },
];

const RANGE_LABEL: Record<string, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

// Token usage thresholds for warn/bad tint on response time.
// Avg > 60s is warn (slow), > 120s is bad (very slow).
const RESPONSE_WARN_MS = 60_000;
const RESPONSE_BAD_MS = 120_000;

// Heatmap bucketing — maps a count to 0..5 using a single max-anchored linear scale.
function heatBucket(count: number, maxCount: number): number {
  if (count <= 0 || maxCount <= 0) return 0;
  if (count >= maxCount) return 5;
  return Math.max(1, Math.round((count / maxCount) * 5));
}

// ─── Component ───────────────────────────────────────────────────

export default function ArkonOSScreen() {
  const [data, setData] = useState<VosOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState("7d");
  // Filter-bar local state. Not yet wired to the activity stream — PR-9a follow-up.
  const [streamSearch, setStreamSearch] = useState("");
  const [streamKind, setStreamKind] = useState("all");

  const fetchData = (r: string) => {
    setLoading(true);
    setError(null);
    apiFetch<VosOverview>(`/api/arkonos/overview?range=${r}`)
      .then(setData)
      .catch((e) => {
        setError(String(e));
        toast.error("Failed to load ArkonOS data");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => fetchData(range));
    return () => window.cancelAnimationFrame(frame);
  }, [range]);

  // Heatmap matrix — pivot sparse (channel, hour, count) rows into per-channel
  // arrays of 24. Limited to top 5 channels by total messages so the grid stays
  // legible. Channels with zero activity in the 24h window are dropped.
  const heat = useMemo(() => {
    if (!data) return null;
    const byChannel = new Map<
      string,
      { slug: string; name: string; cells: number[]; total: number }
    >();
    for (const row of data.hourlyByChannel ?? []) {
      const e = byChannel.get(row.channel_slug) ?? {
        slug: row.channel_slug,
        name: row.channel_name,
        cells: Array(24).fill(0),
        total: 0,
      };
      e.cells[row.hour] = row.count;
      e.total += row.count;
      byChannel.set(row.channel_slug, e);
    }
    const rows = Array.from(byChannel.values())
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
    const maxCount = rows.reduce(
      (acc, r) => Math.max(acc, ...r.cells),
      0,
    );
    return { rows, maxCount };
  }, [data]);

  // Heatmap peak callout — first (channel, hour) pair matching maxCount.
  // Plain derived value, not memoized: O(channels × 24) ≤ 120 ops per render.
  let heatPeak: { slug: string; hour: number; count: number } | null = null;
  if (heat && heat.maxCount > 0) {
    outer: for (const r of heat.rows) {
      for (let h = 0; h < r.cells.length; h++) {
        if (r.cells[h] === heat.maxCount) {
          heatPeak = { slug: r.slug, hour: h, count: r.cells[h] };
          break outer;
        }
      }
    }
  }

  // Active-channel count for PulseStrip hero.
  const activeChannelCount = useMemo(() => {
    if (!data) return { active: 0, total: 0 };
    const active = data.channelActivity.filter((c) => c.message_count > 0).length;
    return { active, total: data.channelActivity.length };
  }, [data]);

  // Top 3 model names for PulseStrip hero sub-text.
  const topModelsSub = useMemo(() => {
    if (!data || data.modelBreakdown.length === 0) return "—";
    return data.modelBreakdown
      .slice(0, 3)
      .map((m) => m.model.replace(/^claude-/, "").replace(/-\d{8,}$/, ""))
      .join(", ");
  }, [data]);

  const responseTint: "warn" | "bad" | undefined = data
    ? data.responseStats.avg_duration_ms >= RESPONSE_BAD_MS
      ? "bad"
      : data.responseStats.avg_duration_ms >= RESPONSE_WARN_MS
        ? "warn"
        : undefined
    : undefined;

  const totalErrors = data
    ? data.summary.errors + data.summary.interrupted
    : 0;

  // Max channel msg count for share-bars in Channels card.
  const maxChannelMsgs = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.channelActivity.map((c) => c.message_count));
  }, [data]);

  // Max model msg count for share-bars in Model usage card.
  const maxModelMsgs = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, ...data.modelBreakdown.map((m) => m.message_count));
  }, [data]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="ArkonOS"
        subtitle="Observe agent activity inside ArkonOS. Every chat, every channel, every model — graded and counted."
        live={!!data}
        updated={data ? timeAgo(data.timestamp) : undefined}
        action={
          <div className="flex items-center gap-2">
            <Tabs active={range} onChange={setRange} items={RANGE_OPTIONS} />
            <Button type="button" kind="ghost" onClick={() => fetchData(range)} disabled={loading}>
              <Filter className="h-3.5 w-3.5" />
              Channels
            </Button>
            <Button type="button" kind="ghost" onClick={() => window.open("/arkonos", "_blank")}>
              <ExternalLink className="h-3.5 w-3.5" />
              Open ArkonOS
            </Button>
          </div>
        }
      />

      {error && (
        <div className="rounded-[var(--radius-card)] border border-[var(--danger)]/30 bg-[var(--danger)]/5 p-4 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-[var(--radius-card)] bg-[var(--bg-surface-2)]/30" />
          ))}
        </div>
      ) : data ? (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          {/* Hero — observability pulse. Single brand color per cell. */}
          <PulseStrip
            cols={6}
            cells={[
              {
                label: `Messages · ${RANGE_LABEL[range]}`,
                value: data.summary.total_messages.toLocaleString(),
                sub: `${data.summary.user_messages} user · ${data.summary.assistant_messages} assistant`,
              },
              {
                label: "Avg response",
                value: data.responseStats.avg_duration_ms > 0
                  ? formatMs(data.responseStats.avg_duration_ms)
                  : "—",
                sub: data.responseStats.p95_duration_ms > 0
                  ? `p95 ${formatMs(data.responseStats.p95_duration_ms)}`
                  : "telemetry-pending",
                tint: responseTint,
              },
              {
                label: `Tokens · ${RANGE_LABEL[range]}`,
                value: Number(data.tokenUsage.total_tokens) > 0
                  ? formatTokens(Number(data.tokenUsage.total_tokens))
                  : "—",
                sub: Number(data.tokenUsage.total_tokens) > 0
                  ? `${formatTokens(Number(data.tokenUsage.input_tokens))} in · ${formatTokens(Number(data.tokenUsage.output_tokens))} out`
                  : "telemetry-pending",
              },
              {
                label: "Errors",
                value: totalErrors.toString(),
                sub: totalErrors > 0
                  ? `${data.summary.errors} error · ${data.summary.interrupted} interrupted`
                  : "none in range",
                tint: totalErrors > 0 ? "bad" : undefined,
              },
              {
                label: "Active channels",
                value: activeChannelCount.active.toString(),
                sub: `of ${activeChannelCount.total} wired`,
              },
              {
                label: "Models",
                value: data.tokenUsage.model_count.toString(),
                sub: topModelsSub,
              },
            ]}
          />

          {/* Filter bar — visual scaffold matching canonical brief. Search +
              context chips + activity-kind tabs + export. NOT WIRED to the
              activity stream yet; tracked as a PR-9a follow-up WI. */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-1 items-center gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
              <Search className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
              <input
                type="text"
                placeholder="Search messages, channels, agents…"
                value={streamSearch}
                onChange={(e) => setStreamSearch(e.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
              />
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                channel:warden
                <X className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
              </span>
              <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-[var(--bg-surface-2)] px-2 py-0.5 font-mono text-[11px] text-[var(--text-secondary)]">
                model:claude-opus-4-7
                <X className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden />
              </span>
            </div>
            <Tabs
              active={streamKind}
              onChange={setStreamKind}
              items={STREAM_KIND_OPTIONS}
            />
            <Button type="button" kind="ghost" onClick={() => toast("Export — not yet wired") }>
              <Download className="h-3.5 w-3.5" />
              Export
            </Button>
          </div>

          {/* Main two-column — activity stream + aggregates */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]">
            {/* LEFT — activity stream */}
            <Card
              title="Activity stream"
              meta={`last ${data.recentMessages.length} · auto`}
              action={
                <Button
                  type="button"
                  kind="ghost"
                  onClick={() => toast("Open trace — not yet wired")}
                >
                  Open trace
                  <ArrowRight className="h-3 w-3" />
                </Button>
              }
              flush
            >
              {data.recentMessages.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-[var(--text-tertiary)]">
                  No messages in range
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {data.recentMessages.map((msg) => {
                    const persona = personaFor(msg.channel_slug);
                    const meta = (msg.metadata ?? {}) as {
                      usage?: { total?: number | string };
                      type?: string;
                    };
                    const tokens = Number(meta.usage?.total ?? 0);
                    const isErr = msg.status === "error";
                    const isWarm = msg.status === "interrupted";
                    const isToolCall = meta.type === "tool_call";
                    return (
                      <li
                        key={msg.id}
                        className="grid grid-cols-[64px_8px_1fr_auto_auto] items-start gap-3 px-5 py-3 text-sm"
                      >
                        <span className="pt-0.5 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                          {timeAgo(msg.created_at)}
                        </span>
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 rounded-full ${
                            isErr
                              ? "bg-[var(--danger)]"
                              : isWarm
                                ? "bg-[var(--warning)]"
                                : "bg-[var(--accent)]"
                          }`}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                            {msg.role === "user" ? (
                              <User className="h-3 w-3" />
                            ) : isToolCall ? (
                              <Wrench className="h-3 w-3" />
                            ) : persona ? (
                              <Avatar name={msg.channel_slug} persona={persona} size="sm" />
                            ) : (
                              <Bot className="h-3 w-3" />
                            )}
                            <span className="truncate text-[var(--text-primary)]">
                              {msg.channel_slug || msg.role}
                            </span>
                          </div>
                          <p
                            className={`mt-0.5 truncate text-xs ${
                              isErr
                                ? "text-[var(--danger)]"
                                : isWarm
                                  ? "text-[var(--warning)]"
                                  : "text-[var(--text-secondary)]"
                            }`}
                          >
                            {msg.content_preview || "—"}
                          </p>
                        </div>
                        <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                          #{msg.channel_slug}
                        </span>
                        <span className="font-mono text-[11px] text-[var(--text-tertiary)]">
                          {tokens > 0 ? formatTokens(tokens) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {/* RIGHT — aggregates stacked */}
            <div className="flex flex-col gap-4">
              <Card title="Channels" meta="active first" flush>
                {data.channelActivity.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-[var(--text-tertiary)]">
                    —
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {data.channelActivity.map((ch) => {
                      const persona = personaFor(ch.channel_slug);
                      const pct = (ch.message_count / maxChannelMsgs) * 100;
                      const isLive = ch.message_count > 0;
                      return (
                        <li
                          key={ch.channel_slug}
                          className="grid grid-cols-[1fr_60px_50px_50px] items-center gap-3 px-5 py-2.5"
                        >
                          <div className="flex min-w-0 items-center gap-2">
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                ch.error_count > 0
                                  ? "bg-[var(--danger)]"
                                  : isLive
                                    ? "bg-[var(--accent)]"
                                    : "bg-[var(--text-tertiary)]"
                              }`}
                              aria-hidden
                            />
                            <span
                              className={`truncate text-sm ${
                                isLive ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                              }`}
                              title={persona ? `${ch.channel_name} (${persona})` : ch.channel_name}
                            >
                              #{ch.channel_slug}
                            </span>
                            {ch.error_count > 0 && (
                              <span className="font-mono text-[11px] text-[var(--danger)]">
                                {ch.error_count} err
                              </span>
                            )}
                          </div>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${Math.max(2, pct)}%`, opacity: isLive ? 0.7 : 0.2 }}
                            />
                          </div>
                          <span className="text-right font-mono text-[11px] text-[var(--text-secondary)]">
                            {ch.message_count}
                          </span>
                          <span className="text-right font-mono text-[11px] text-[var(--text-tertiary)]">
                            {ch.last_message_at ? timeAgo(ch.last_message_at) : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card title="Model usage" meta={RANGE_LABEL[range]} flush>
                {data.modelBreakdown.length === 0 ? (
                  <p className="px-5 py-6 text-center text-sm text-[var(--text-tertiary)]">
                    —
                  </p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {data.modelBreakdown.slice(0, 5).map((m) => {
                      const pct = (m.message_count / maxModelMsgs) * 100;
                      return (
                        <li
                          key={`${m.model}-${m.provider}`}
                          className="grid grid-cols-[1.4fr_60px_1fr_60px] items-center gap-3 px-5 py-2.5"
                        >
                          <span className="truncate font-mono text-xs text-[var(--text-primary)]" title={m.model}>
                            {m.model}
                          </span>
                          <span className="text-right font-mono text-[11px] text-[var(--text-secondary)]">
                            {m.message_count}
                          </span>
                          <div className="h-1 w-full overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
                            <div
                              className="h-full rounded-full bg-[var(--accent)]"
                              style={{ width: `${Math.max(2, pct)}%`, opacity: 0.7 }}
                            />
                          </div>
                          <span className="text-right font-mono text-[11px] text-[var(--text-tertiary)]">
                            {m.avg_duration_ms > 0 ? formatMs(m.avg_duration_ms) : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            </div>
          </div>

          {/* Heatmap — last 24h channel × hour intensity. Section-styled (no
              card chrome) per brief. */}
          <section>
            <SectionTitle
              title="Activity by hour"
              note={
                heat && heat.rows.length > 0
                  ? `UTC · last 24h · ${heat.rows.length} channel${heat.rows.length === 1 ? "" : "s"}`
                  : "UTC · last 24h"
              }
            />
            {!heat || heat.rows.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-8 text-center text-sm text-[var(--text-tertiary)]">
                No activity in the last 24h
              </p>
            ) : (
              <div>
                <div className="flex flex-col gap-1">
                  {heat.rows.map((row) => (
                    <div
                      key={row.slug}
                      className="grid items-center gap-1"
                      style={{ gridTemplateColumns: "100px repeat(24, minmax(0, 1fr))" }}
                    >
                      <span className="truncate font-mono text-[11px] text-[var(--text-secondary)]" title={row.name}>
                        #{row.slug}
                      </span>
                      {row.cells.map((v, i) => {
                        const b = heatBucket(v, heat.maxCount);
                        const alpha = b === 0 ? 0.05 : 0.15 + b * 0.17;
                        return (
                          <div
                            key={i}
                            className="h-4 rounded-[2px]"
                            style={{ backgroundColor: `rgba(var(--ion-rgb), ${alpha})` }}
                            title={`${row.slug} · ${i.toString().padStart(2, "0")}:00 · ${v} msg${v === 1 ? "" : "s"}`}
                          />
                        );
                      })}
                    </div>
                  ))}
                  <div
                    className="mt-1 grid items-center gap-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]"
                    style={{ gridTemplateColumns: "100px repeat(24, minmax(0, 1fr))" }}
                  >
                    <span />
                    {Array.from({ length: 24 }, (_, i) => (
                      <span key={i} className="text-center">
                        {i % 4 === 0 ? i.toString().padStart(2, "0") : ""}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                  <div className="flex items-center gap-1.5">
                    <span>Less</span>
                    {[0, 1, 2, 3, 4, 5].map((v) => (
                      <div
                        key={v}
                        className="h-3 w-3 rounded-[2px]"
                        style={{ backgroundColor: `rgba(var(--ion-rgb), ${v === 0 ? 0.05 : 0.15 + v * 0.17})` }}
                      />
                    ))}
                    <span>More</span>
                  </div>
                  {heatPeak ? (
                    <span>
                      Peak · #{heatPeak.slug} at {heatPeak.hour.toString().padStart(2, "0")}:00 · {heatPeak.count} msgs
                    </span>
                  ) : null}
                </div>
              </div>
            )}
          </section>

          {/* Recent errors — section-styled per brief with "Full error log →" action */}
          <section>
            <SectionTitle
              title="Recent errors"
              note={`last ${data.recentErrors.length}`}
              action={
                data.recentErrors.length > 0 ? (
                  <Button
                    type="button"
                    kind="ghost"
                    onClick={() => toast("Full error log — not yet wired")}
                  >
                    Full error log
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                ) : undefined
              }
            />
            {data.recentErrors.length === 0 ? (
              <p className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-6 text-center text-sm text-[var(--success)]">
                No errors in range
              </p>
            ) : (
              <Card flush>
                <ul className="divide-y divide-[var(--border)]">
                  {data.recentErrors.map((err) => {
                    const isErr = err.status === "error";
                    const persona = personaFor(err.channel_slug);
                    const headline = err.content_preview?.split(" — ")[0] || "—";
                    const detail =
                      err.content_preview && err.content_preview.includes(" — ")
                        ? err.content_preview.split(" — ").slice(1).join(" — ")
                        : "";
                    return (
                      <li
                        key={err.id}
                        className="grid grid-cols-[24px_28px_1fr_auto] items-start gap-3 px-5 py-3"
                      >
                        <AlertTriangle
                          className={`mt-0.5 h-4 w-4 ${isErr ? "text-[var(--danger)]" : "text-[var(--warning)]"}`}
                        />
                        {persona ? (
                          <Avatar name={err.channel_slug ?? err.channel_name} persona={persona} size="sm" />
                        ) : (
                          <span className="h-6 w-6" aria-hidden />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm text-[var(--text-primary)]">{headline}</div>
                          {detail ? (
                            <p className="mt-1 truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                              {detail}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <StatusPill status={isErr ? "err" : "warm"}>
                            {isErr ? "Error" : "Interrupt"}
                          </StatusPill>
                          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                            {timeAgo(err.created_at)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
          </section>
        </motion.div>
      ) : null}
    </div>
  );
}
