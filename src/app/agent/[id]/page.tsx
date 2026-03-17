"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { ShellHeader, Card, SectionTitle } from "@/components/mission-control/dashboard";
import { CardEntranceWrapper, SkeletonCard } from "@/components/mission-control/charts";
import { useActiveRuns } from "@/hooks/use-active-runs";
import { KillConfirmModal } from "@/components/mission-control/kill-confirm-modal";
import { OctagonX, Pause, Play } from "lucide-react";

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
}

interface AgentData {
  agent: {
    id: string;
    name: string;
    role: string;
    metadata: Record<string, string>;
    created_at: string;
  };
  events: Event[];
  sessions: Array<{
    session_key: string;
    channel_id: string;
    last_active: string;
    message_count: number;
  }>;
  stats: Array<{
    day: string;
    messages_received: number;
    messages_sent: number;
    tool_calls: number;
    errors: number;
    estimated_tokens: number;
  }>;
}

/* ─── Auth ───────────────────────────────────────────────── */
function getToken(): string {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/mc_auth=([^;]+)/)?.[1]
    ?? "";
}

/* ─── Helpers ────────────────────────────────────────────── */
const EVENT_ICON: Record<string, string> = {
  message_received: "📥",
  message_sent: "📤",
  tool_call: "🔧",
  error: "❌",
  cron: "⏰",
  system: "⚙️",
  note: "📝",
};

const EVENT_COLOUR: Record<string, string> = {
  message_received: "border-[#06d6a0]/30 bg-[rgba(6,214,160,0.04)]",
  message_sent: "border-[#8b5cf6]/30 bg-[rgba(139,92,246,0.04)]",
  tool_call: "border-[#f59e0b]/30 bg-[rgba(245,158,11,0.04)]",
  error: "border-red-500/30 bg-[rgba(239,68,68,0.04)]",
  cron: "border-sky-500/30 bg-[rgba(14,165,233,0.04)]",
};

function eventColour(type: string) {
  return EVENT_COLOUR[type] ?? "border-[#1a2a4a] bg-[#0d0d18]";
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

const ROLE_COLOURS: Record<string, string> = {
  owner: "bg-[rgba(139,92,246,0.15)] text-purple-400",
  admin: "bg-[rgba(6,214,160,0.15)] text-cyan-400",
  agent: "bg-[rgba(59,130,246,0.15)] text-blue-400",
  viewer: "bg-[rgba(100,116,139,0.15)] text-slate-400",
};

/* ─── Chart tooltip ──────────────────────────────────────── */
function ChartTip({ active, payload, label }: { active?: boolean; payload?: Array<{name: string; value: number; fill?: string; stroke?: string}>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[#1a2a4a] bg-[#0a0a14] px-3 py-2 text-xs">
      <p className="mb-1 font-semibold text-[#94a3b8]">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.fill ?? p.stroke ?? "#06d6a0" }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
}

/* ─── Stat pill ──────────────────────────────────────────── */
function StatPill({ label, value, colour = "text-[#06d6a0]" }: { label: string; value: string | number; colour?: string }) {
  return (
    <div className="rounded-2xl border border-[#1a2a4a] bg-[#05050f]/70 px-4 py-3 text-center">
      <div className={`text-xl font-bold ${colour}`}>{value}</div>
      <div className="mt-0.5 text-xs text-[#64748b]">{label}</div>
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

  const chartData = [...(data?.stats ?? [])].reverse().map((s) => ({
    day: new Date(s.day).toLocaleDateString("en-ZA", { weekday: "short" }),
    received: s.messages_received,
    sent: s.messages_sent,
    tools: s.tool_calls,
    tokens: Math.round((s.estimated_tokens ?? 0) / 1000),
    errors: s.errors,
  }));

  const eventTypes = ["all", ...Array.from(new Set((data?.events ?? []).map((e) => e.event_type)))];
  const filteredEvents = filter === "all" ? (data?.events ?? []) : (data?.events ?? []).filter((e) => e.event_type === filter);

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
        subtitle={`${data.agent.id} · joined ${fmtDate(data.agent.created_at)}`}
        action={
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-[#06d6a0] animate-pulse" />
            <span className="text-xs text-[#64748b]">Live</span>
            {data.agent.role && (
              <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLOURS[data.agent.role] ?? ""}`}>
                {data.agent.role}
              </span>
            )}
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

      {/* ── 7-day summary pills ── */}
      <CardEntranceWrapper>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatPill label="Messages (7d)" value={totalMessages} />
          <StatPill label="Tool Calls (7d)" value={totalToolCalls} colour="text-[#8b5cf6]" />
          <StatPill label="~Tokens (7d)" value={`${Math.round(totalTokens / 1000)}k`} colour="text-[#f59e0b]" />
          <StatPill label="Errors (7d)" value={totalErrors} colour={totalErrors > 0 ? "text-red-400" : "text-[#64748b]"} />
        </div>
      </CardEntranceWrapper>

      {/* ── Message volume chart ── */}
      {chartData.length > 0 && (
        <Card>
          <SectionTitle title="Message Volume — 7 Days" />
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRecv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06d6a0" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#06d6a0" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
              <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="received" name="Received" stroke="#06d6a0" strokeWidth={2} fill="url(#gradRecv)" dot={false} />
              <Area type="monotone" dataKey="sent" name="Sent" stroke="#8b5cf6" strokeWidth={2} fill="url(#gradSent)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── Tool calls chart ── */}
      {chartData.length > 0 && totalToolCalls > 0 && (
        <Card>
          <SectionTitle title="Tool Calls — 7 Days" />
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1a2a4a" />
              <XAxis dataKey="day" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Bar dataKey="tools" name="Tool Calls" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* ── Active sessions ── */}
      {data.sessions.length > 0 && (
        <Card>
          <SectionTitle title="Sessions" note={`${data.sessions.length} recent`} />
          <div className="space-y-2">
            {data.sessions.slice(0, 8).map((s) => (
              <div key={s.session_key} className="flex items-center justify-between rounded-2xl border border-[#1a2a4a] bg-[#05050f]/70 px-4 py-3">
                <div>
                  <div className="font-mono text-xs text-[#06d6a0] truncate max-w-[200px] sm:max-w-none">{s.session_key}</div>
                  <div className="mt-0.5 text-xs text-[#64748b]">{s.channel_id || "unknown channel"}</div>
                </div>
                <div className="text-right text-xs text-[#64748b]">
                  <div>{s.message_count} msgs</div>
                  <div>{fmtTime(s.last_active)}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── Event timeline ── */}
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <SectionTitle title="Event Timeline" note={`${filteredEvents.length} events`} />
          <div className="flex flex-wrap gap-1.5">
            {eventTypes.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === t ? "bg-[#06d6a0] text-[#05050f]" : "border border-[#1a2a4a] text-[#64748b] hover:text-[#e2e8f0]"}`}
              >
                {t === "all" ? "All" : t.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#64748b]">
              No events yet. Install the Mission Logger hook to start capturing data.
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
                    <span className="shrink-0">{EVENT_ICON[event.event_type] ?? "📌"}</span>
                    <span className="text-sm font-semibold text-[#e2e8f0] truncate">
                      {event.event_type.replace(/_/g, " ")}
                    </span>
                    {event.content_redacted && (
                      <span className="shrink-0 rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-400">REDACTED</span>
                    )}
                  </div>
                  <div className="shrink-0 text-right text-xs text-[#64748b]">
                    <div>{fmtTime(event.created_at)}</div>
                    {event.token_estimate > 0 && <div>{event.token_estimate}t</div>}
                  </div>
                </div>

                {event.content && (
                  <p className="mt-1.5 text-sm text-[#94a3b8] line-clamp-2">
                    {event.content.slice(0, 200)}{event.content.length > 200 ? "…" : ""}
                  </p>
                )}

                {expandedEvent === event.id && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-3 rounded-xl border border-[#1a2a4a] bg-[#05050f] p-3"
                  >
                    <pre className="whitespace-pre-wrap break-words font-mono text-xs text-[#94a3b8]">
                      {event.content}
                    </pre>
                    <div className="mt-2 flex flex-wrap gap-3 text-xs text-[#64748b]">
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
    </div>
  );
}
