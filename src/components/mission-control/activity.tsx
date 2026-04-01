"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ShellHeader, Card, SectionTitle } from "./dashboard";
import { SkeletonCard } from "./charts";
import { ActivityEmpty } from "./empty-states";
import { SectionDescription } from "./dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

/* ─── Types ─────────────────────────────────────────────── */
type FeedEvent = {
  id: string;
  agent_id: string;
  agent_name: string;
  event_type: string;
  direction: string;
  session_key: string;
  channel_id: string;
  sender: string;
  content: string;
  content_redacted: boolean;
  token_estimate: number;
  created_at: string;
  threat_level?: string;
  threat_classes?: string[];
};

/* ─── Auth ───────────────────────────────────────────────── */
function getToken() {
  if (typeof document === "undefined") return "";
  return document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "";
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

const EVENT_BORDER: Record<string, string> = {
  message_received: "border-l-[#00D47E]",
  message_sent: "border-l-[#00D47E]",
  tool_call: "border-l-[#f59e0b]",
  error: "border-l-red-500",
  cron: "border-l-sky-400",
  system: "border-l-slate-400",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

/* ─── Event row ──────────────────────────────────────────── */
function EventRow({ event, expanded, onToggle }: {
  event: FeedEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, height: 0 }}
      className={`relative card-hover cursor-pointer rounded-2xl border border-[var(--border)] border-l-2 bg-[var(--bg-primary)]/70 px-4 py-3 transition hover:border-[var(--border-strong)] ${EVENT_BORDER[event.event_type] ?? "border-l-slate-600"}`}
      onClick={onToggle}
    >
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-base">{EVENT_ICON[event.event_type] ?? "📌"}</span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                href={`/agent/${event.agent_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-xs font-semibold text-[var(--accent)] hover:underline"
              >
                {event.agent_name}
              </Link>
              <span className="text-xs text-[var(--text-secondary)]">
                {event.event_type.replace(/_/g, " ")}
              </span>
              {event.content_redacted && (
                <span className="rounded-full bg-amber-900/30 px-2 py-0.5 text-[10px] text-amber-400">REDACTED</span>
              )}
              {event.threat_level && event.threat_level !== "none" && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  event.threat_level === "critical" ? "bg-red-900/50 text-red-300 animate-pulse" :
                  event.threat_level === "high" ? "bg-red-900/30 text-red-400" :
                  event.threat_level === "medium" ? "bg-amber-900/30 text-amber-400" :
                  "bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                }`}>
                  🛡️ {event.threat_level.toUpperCase()}
                </span>
              )}
            </div>
            {event.content && (
              <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-1">
                {event.content.slice(0, 120)}{event.content.length > 120 ? "…" : ""}
              </p>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right text-xs text-[var(--text-secondary)]">
          <div>{timeAgo(event.created_at)}</div>
          {event.token_estimate > 0 && <div className="text-[10px]">{event.token_estimate}t</div>}
        </div>
      </div>

      <AnimatePresence>
        {expanded && event.content && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3"
          >
            <pre className="whitespace-pre-wrap break-words font-mono text-xs text-[var(--text-secondary)]">
              {event.content}
            </pre>
            <div className="mt-2 flex flex-wrap gap-3 text-[10px] text-[var(--text-secondary)]">
              {event.session_key && <span>Session: {event.session_key}</span>}
              {event.sender && <span>From: {event.sender}</span>}
              {event.channel_id && <span>Channel: {event.channel_id}</span>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
export function ActivityFeed() {
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [newCount, setNewCount] = useState(0);
  const latestRef = useRef<string | null>(null);

  const fetchEvents = useCallback(async (silent = false) => {
    if (paused) return;
    try {
      const token = getToken();
      const res = await fetch("/api/dashboard/activity?limit=100", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json() as { events: FeedEvent[] };
      const incoming = data.events ?? [];

      if (!silent) {
        setEvents(incoming);
        if (incoming[0]) latestRef.current = incoming[0].id;
      } else {
        // Count new since last fetch
        const latest = latestRef.current;
        const newOnes = latest ? incoming.filter((e) => e.id > latest) : [];
        if (newOnes.length > 0) {
          setNewCount((n) => n + newOnes.length);
          latestRef.current = incoming[0]?.id ?? latest;
        }
      }
    } catch {
      // silent fail
    } finally {
      setLoading(false);
    }
  }, [paused]);

  useEffect(() => {
    void fetchEvents(false);
    const iv = setInterval(() => void fetchEvents(true), 10000);
    return () => clearInterval(iv);
  }, [fetchEvents]);

  const handleResume = () => {
    setPaused(false);
    setNewCount(0);
    void fetchEvents(false);
  };

  /* ── Derived ── */
  const agents = ["all", ...Array.from(new Set(events.map((e) => e.agent_id)))];
  const eventTypes = ["all", ...Array.from(new Set(events.map((e) => e.event_type)))];

  const filtered = events.filter((e) => {
    if (filter !== "all" && e.event_type !== filter) return false;
    if (agentFilter !== "all" && e.agent_id !== agentFilter) return false;
    return true;
  });

  const agentNames: Record<string, string> = {};
  events.forEach((e) => { agentNames[e.agent_id] = e.agent_name; });

  /* ── Stats bar ── */
  const typeCount = (t: string) => events.filter((e) => e.event_type === t).length;

  if (loading) {
    return (
      <div className="space-y-4 pb-24">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <ShellHeader
        title="Activity Feed"
        subtitle="Real-time stream of all events across every agent"
        action={
          <div className="flex items-center gap-2">
            {paused ? (
              <button
                onClick={handleResume}
                className="flex items-center gap-1.5 rounded-full bg-amber-900/30 px-3 py-1.5 text-xs text-amber-400 hover:bg-amber-900/50 transition"
              >
                {newCount > 0 && <span className="font-bold">{newCount} new</span>}
                ▶ Resume
              </button>
            ) : (
              <button
                onClick={() => setPaused(true)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                ⏸ Pause
              </button>
            )}
            <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <span className="text-xs text-[var(--text-secondary)]">10s</span>
          </div>
        }
      />

      <SectionDescription id="activity">
        The activity feed shows every event your agents generate in real-time &mdash; messages sent
        and received, tool calls, errors, and more. Use the filters and search to narrow down to
        specific agents, event types, or time ranges.
      </SectionDescription>

      {/* ── Quick stats ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total Events", value: events.length, colour: "text-[var(--text-primary)]" },
          { label: "Messages In", value: typeCount("message_received"), colour: "text-[var(--accent)]" },
          { label: "Tool Calls", value: typeCount("tool_call"), colour: "text-[var(--warning)]" },
          { label: "Errors", value: typeCount("error"), colour: typeCount("error") > 0 ? "text-red-400" : "text-[var(--text-secondary)]" },
        ].map((s) => (
          <div key={s.label} className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]/70 px-4 py-3 text-center">
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <div className={`text-xl font-bold ${s.colour}`}>{s.value}</div>
            <div className="text-xs text-[var(--text-secondary)]">{s.label}</div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <Card>
        <div className="space-y-3">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Event Type</p>
            <div className="flex flex-wrap gap-1.5">
              {eventTypes.map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${filter === t ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  {t === "all" ? "All" : t.replace(/_/g, " ")}
                  {t !== "all" && <span className="ml-1 text-[10px] opacity-60">{typeCount(t)}</span>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Agent</p>
            <div className="flex flex-wrap gap-1.5">
              {agents.map((id) => (
                <button
                  key={id}
                  onClick={() => setAgentFilter(id)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition ${agentFilter === id ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
                >
                  {id === "all" ? "All Agents" : (agentNames[id] ?? id)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* ── Feed ── */}
      <Card>
        <SectionTitle title="Events" note={`${filtered.length} shown`} />
        <div className="space-y-2">
          <AnimatePresence mode="popLayout">
            {filtered.length === 0 ? (
              <ActivityEmpty />
            ) : (
              filtered.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  expanded={expanded === event.id}
                  onToggle={() => setExpanded(expanded === event.id ? null : event.id)}
                />
              ))
            )}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
