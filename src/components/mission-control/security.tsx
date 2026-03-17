"use client";

import { useState, useCallback, useRef, useEffect } from "react";
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
  content_redacted?: boolean;
  dismissed?: boolean;
  dismissed_at?: string;
  dismissed_by?: string;
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

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function getHeaders(): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  const csrf = getCookie("csrf_token");
  if (csrf) h["x-csrf-token"] = csrf;
  return h;
}

/* ─── API Calls ─────────────────────────────────────────── */

async function apiPost<T>(url: string, body?: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json() as Promise<T>;
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

/* ─── Modal Components ──────────────────────────────────── */

function ModalBackdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-md rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function PurgeConfirmModal({
  event,
  onConfirm,
  onCancel,
  loading,
}: {
  event: ThreatEvent;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const config = SEVERITY_CONFIG[event.threat_level] ?? SEVERITY_CONFIG.low;
  const classes = parseJsonField<string[]>(event.threat_classes);

  return (
    <ModalBackdrop onClose={onCancel}>
      <h3 className="text-lg font-bold text-text">Purge Threat Event</h3>
      <p className="mt-2 text-sm text-text-dim">This will permanently delete this event from Arkon. This cannot be undone.</p>

      <div className="mt-4 rounded-xl border border-[#1a2a4a] bg-white/[0.02] p-3">
        <div className="flex items-center gap-2">
          <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase" style={{ background: config.bg, color: config.color }}>
            {config.label}
          </span>
          {classes.map((cls) => (
            <span key={cls} className="text-[10px] text-text-dim">{CLASS_LABELS[cls] ?? cls}</span>
          ))}
        </div>
        <p className="mt-2 text-sm text-text">{event.agent_name ?? `Agent ${event.agent_id}`}</p>
        <p className="mt-1 text-xs text-text-dim">{new Date(event.created_at).toLocaleString()}</p>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={loading} className="rounded-lg px-4 py-2 text-sm text-text-dim hover:bg-white/5 transition">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-red/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red transition disabled:opacity-50"
        >
          {loading ? "Purging..." : "Purge Event"}
        </button>
      </div>
    </ModalBackdrop>
  );
}

function RedactConfirmModal({
  event,
  onConfirm,
  onCancel,
  loading,
}: {
  event: ThreatEvent;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
}) {
  return (
    <ModalBackdrop onClose={onCancel}>
      <h3 className="text-lg font-bold text-text">Redact Sensitive Content</h3>
      <p className="mt-2 text-sm text-text-dim">
        Sensitive content (credentials, keys, tokens) will be replaced with <code className="rounded bg-white/10 px-1 text-[11px]">[REDACTED]</code>. The event will be kept for audit purposes.
      </p>

      <div className="mt-4 rounded-xl border border-[#1a2a4a] bg-white/[0.02] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-dim">Content Preview</p>
        <pre className="mt-1 max-h-32 overflow-auto font-mono text-xs text-text-dim break-all">
          {event.content?.slice(0, 500) || "(empty)"}
          {(event.content?.length ?? 0) > 500 ? "..." : ""}
        </pre>
      </div>

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={loading} className="rounded-lg px-4 py-2 text-sm text-text-dim hover:bg-white/5 transition">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-purple/90 px-4 py-2 text-sm font-semibold text-white hover:bg-purple transition disabled:opacity-50"
        >
          {loading ? "Redacting..." : "Redact & Keep"}
        </button>
      </div>
    </ModalBackdrop>
  );
}

function BulkPurgeConfirmModal({
  count,
  onConfirm,
  onCancel,
  loading,
  progress,
}: {
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  progress?: string;
}) {
  return (
    <ModalBackdrop onClose={onCancel}>
      <h3 className="text-lg font-bold text-text">Bulk Purge Events</h3>
      <p className="mt-2 text-sm text-text-dim">
        Purge <strong className="text-text">{count}</strong> selected threat event{count !== 1 ? "s" : ""}? This cannot be undone.
      </p>

      {progress && (
        <p className="mt-3 text-sm font-medium text-cyan">{progress}</p>
      )}

      <div className="mt-5 flex justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={loading} className="rounded-lg px-4 py-2 text-sm text-text-dim hover:bg-white/5 transition">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-red/90 px-4 py-2 text-sm font-semibold text-white hover:bg-red transition disabled:opacity-50"
        >
          {loading ? "Purging..." : `Purge ${count} Event${count !== 1 ? "s" : ""}`}
        </button>
      </div>
    </ModalBackdrop>
  );
}

/* ─── Toast ─────────────────────────────────────────────── */

function Toast({ message, type, onDone }: { message: string; type: "success" | "error" | "info"; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);

  const bg = type === "success" ? "bg-green/15 border-green/30 text-green" : type === "error" ? "bg-red/15 border-red/30 text-red" : "bg-cyan/15 border-cyan/30 text-cyan";

  return (
    <div className={`fixed bottom-6 right-6 z-50 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${bg}`}>
      {message}
    </div>
  );
}

/* ─── Action Menu ───────────────────────────────────────── */

function ActionMenu({
  event,
  onPurge,
  onRedact,
  onDismiss,
}: {
  event: ThreatEvent;
  onPurge: (e: ThreatEvent) => void;
  onRedact: (e: ThreatEvent) => void;
  onDismiss: (e: ThreatEvent) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded-lg p-1.5 text-text-dim hover:bg-white/10 hover:text-text transition"
        title="Actions"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-8 z-40 w-52 rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] py-1 shadow-xl">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onPurge(event); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red hover:bg-red/10 transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
            </svg>
            Purge Event
          </button>
          {!event.content_redacted && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); onRedact(event); }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-purple hover:bg-purple/10 transition"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 3a2.85 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5z" />
              </svg>
              Redact &amp; Keep
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onDismiss(event); }}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-dim hover:bg-white/5 hover:text-text transition"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
            {event.dismissed ? "Restore Event" : "Dismiss as False Positive"}
          </button>
        </div>
      )}
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

/* ─── Threat Event Row (with action menu + checkbox) ───── */

function ThreatEventRow({
  event,
  selected,
  onToggleSelect,
  onPurge,
  onRedact,
  onDismiss,
}: {
  event: ThreatEvent;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onPurge: (e: ThreatEvent) => void;
  onRedact: (e: ThreatEvent) => void;
  onDismiss: (e: ThreatEvent) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const config = SEVERITY_CONFIG[event.threat_level] ?? SEVERITY_CONFIG.low;
  const classes = parseJsonField<string[]>(event.threat_classes);
  const matches = parseJsonField<Array<{ class: string; pattern: string; excerpt: string }>>(event.threat_matches);

  return (
    <div
      className={`rounded-xl border transition ${
        event.dismissed
          ? "border-[#1a2a4a]/50 bg-[#0d0d1a]/50 opacity-60"
          : selected
            ? "border-cyan/40 bg-cyan/[0.03]"
            : "border-[#1a2a4a] bg-[#0d0d1a] card-hover"
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-3 sm:px-4">
        {/* Checkbox */}
        <label className="flex shrink-0 cursor-pointer items-center" onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(event.id)}
            className="h-4 w-4 rounded border-[#1a2a4a] bg-transparent accent-cyan"
          />
        </label>

        {/* Main row button */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <PulsingDot status={event.threat_level === "critical" ? "error" : event.threat_level === "high" ? "warm" : "idle"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
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
              {event.content_redacted && (
                <span className="rounded-full bg-purple/15 px-2 py-0.5 text-[10px] font-bold text-purple">REDACTED</span>
              )}
              {event.dismissed && (
                <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-text-dim">DISMISSED</span>
              )}
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
          <span className="hidden shrink-0 text-xs text-text-dim sm:inline">{timeAgo(event.created_at)}</span>
          <span className="shrink-0 text-text-dim">{expanded ? "\u25B2" : "\u25BC"}</span>
        </button>

        {/* Action menu */}
        <ActionMenu event={event} onPurge={onPurge} onRedact={onRedact} onDismiss={onDismiss} />
      </div>

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
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-4 text-[11px] text-text-dim">
              <span>ID: {event.id}</span>
              <span>Sender: {event.sender ?? "unknown"}</span>
              <span>{new Date(event.created_at).toLocaleString()}</span>
            </div>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => onPurge(event)}
                className="rounded-lg border border-red/30 px-3 py-1.5 text-xs font-semibold text-red hover:bg-red/10 transition"
              >
                Purge
              </button>
              {!event.content_redacted && (
                <button
                  type="button"
                  onClick={() => onRedact(event)}
                  className="rounded-lg border border-purple/30 px-3 py-1.5 text-xs font-semibold text-purple hover:bg-purple/10 transition"
                >
                  Redact
                </button>
              )}
              <button
                type="button"
                onClick={() => onDismiss(event)}
                className="rounded-lg border border-[#1a2a4a] px-3 py-1.5 text-xs font-semibold text-text-dim hover:bg-white/5 hover:text-text transition"
              >
                {event.dismissed ? "Restore" : "Dismiss"}
              </button>
            </div>
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
  const [showDismissed, setShowDismissed] = useState(false);

  // Selection state for bulk actions
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal state
  const [purgeTarget, setPurgeTarget] = useState<ThreatEvent | null>(null);
  const [redactTarget, setRedactTarget] = useState<ThreatEvent | null>(null);
  const [bulkPurgeOpen, setBulkPurgeOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<string>("");

  // Toast state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  // Refresh counter to force re-fetch after mutations
  const [refreshKey, setRefreshKey] = useState(0);

  const params = new URLSearchParams({ range });
  if (severityFilter) params.set("severity", severityFilter);
  if (classFilter) params.set("class", classFilter);
  if (showDismissed) params.set("show_dismissed", "true");
  params.set("_r", String(refreshKey)); // cache buster

  const { data, loading, error } = usePollingFetch<SecurityData>(
    `/api/security/overview?${params}`,
    30000
  );

  const events = data?.events ?? [];

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  // Toggle selection
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selectedIds.size === events.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(events.map((e) => e.id)));
    }
  }, [events, selectedIds.size]);

  // ─── Action handlers ─────────────────────────────────

  const handlePurge = useCallback(async (event: ThreatEvent) => {
    setPurgeTarget(event);
  }, []);

  const confirmPurge = useCallback(async () => {
    if (!purgeTarget) return;
    setActionLoading(true);
    try {
      await apiPost(`/api/events/${purgeTarget.id}/purge`);
      setToast({ message: `Event purged from Arkon.`, type: "success" });
      setPurgeTarget(null);
      setSelectedIds((prev) => { const next = new Set(prev); next.delete(purgeTarget.id); return next; });
      refresh();
    } catch (err) {
      setToast({ message: `Purge failed: ${err instanceof Error ? err.message : "Unknown error"}`, type: "error" });
    } finally {
      setActionLoading(false);
    }
  }, [purgeTarget, refresh]);

  const handleRedact = useCallback(async (event: ThreatEvent) => {
    setRedactTarget(event);
  }, []);

  const confirmRedact = useCallback(async () => {
    if (!redactTarget) return;
    setActionLoading(true);
    try {
      const result = await apiPost<{ redacted_count: number; patterns_matched: string[] }>(`/api/events/${redactTarget.id}/redact`);
      if (result.redacted_count > 0) {
        setToast({ message: `Redacted ${result.redacted_count} sensitive pattern${result.redacted_count !== 1 ? "s" : ""}.`, type: "success" });
      } else {
        setToast({ message: "No sensitive patterns found to redact.", type: "info" });
      }
      setRedactTarget(null);
      refresh();
    } catch (err) {
      setToast({ message: `Redaction failed: ${err instanceof Error ? err.message : "Unknown error"}`, type: "error" });
    } finally {
      setActionLoading(false);
    }
  }, [redactTarget, refresh]);

  const handleDismiss = useCallback(async (event: ThreatEvent) => {
    const isDismissed = event.dismissed;
    try {
      const result = await apiPost<{ ok: boolean; suggestion?: string | null }>(`/api/events/${event.id}/dismiss`, { dismissed: !isDismissed });
      if (isDismissed) {
        setToast({ message: "Event restored.", type: "success" });
      } else {
        setToast({ message: result.suggestion ?? "Dismissed as false positive.", type: result.suggestion ? "info" : "success" });
      }
      refresh();
    } catch (err) {
      setToast({ message: `Action failed: ${err instanceof Error ? err.message : "Unknown error"}`, type: "error" });
    }
  }, [refresh]);

  const handleBulkPurge = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setBulkPurgeOpen(true);
  }, [selectedIds.size]);

  const confirmBulkPurge = useCallback(async () => {
    const ids = Array.from(selectedIds);
    setActionLoading(true);
    setBulkProgress(`Purging ${ids.length} events...`);
    try {
      const result = await apiPost<{ purged_count: number; not_found_count: number }>("/api/events/bulk-purge", { event_ids: ids });
      setToast({
        message: `${result.purged_count} event${result.purged_count !== 1 ? "s" : ""} purged.${result.not_found_count > 0 ? ` ${result.not_found_count} not found.` : ""}`,
        type: "success",
      });
      setSelectedIds(new Set());
      setBulkPurgeOpen(false);
      setBulkProgress("");
      refresh();
    } catch (err) {
      setToast({ message: `Bulk purge failed: ${err instanceof Error ? err.message : "Unknown error"}`, type: "error" });
    } finally {
      setActionLoading(false);
    }
  }, [selectedIds, refresh]);

  // ─── Render ────────────────────────────────────────────

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
    topAgents = [],
    totalEvents = { total: 0, threats: 0 },
  } = data ?? {};

  const allSelected = events.length > 0 && selectedIds.size === events.length;

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

      {/* Filters + Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
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

        {/* Show Dismissed Toggle */}
        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-sm text-text-dim hover:text-text transition">
          <input
            type="checkbox"
            checked={showDismissed}
            onChange={(e) => setShowDismissed(e.target.checked)}
            className="h-3.5 w-3.5 accent-cyan"
          />
          Show dismissed
        </label>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm font-medium text-cyan">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={handleBulkPurge}
              className="rounded-lg bg-red/90 px-3 py-2 text-xs font-semibold text-white hover:bg-red transition"
            >
              Purge Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="rounded-lg px-3 py-2 text-xs text-text-dim hover:bg-white/5 hover:text-text transition"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Threat Events List */}
      <div>
        <div className="mb-3 flex items-center gap-3">
          {events.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={selectAll}
                className="h-4 w-4 accent-cyan"
              />
            </label>
          )}
          <p className="text-sm font-semibold text-text">
            Recent Threat Events
            <span className="ml-2 text-text-dim">({events.length})</span>
          </p>
        </div>
        {events.length === 0 ? (
          <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-8 text-center">
            <p className="text-3xl">&#x1F6E1;</p>
            <p className="mt-2 text-sm font-semibold text-text">All Clear</p>
            <p className="mt-1 text-xs text-text-dim">
              {showDismissed ? "No threats in this period" : "No active threats detected in this period"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((event) => (
              <ThreatEventRow
                key={event.id}
                event={event}
                selected={selectedIds.has(event.id)}
                onToggleSelect={toggleSelect}
                onPurge={handlePurge}
                onRedact={handleRedact}
                onDismiss={handleDismiss}
              />
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {purgeTarget && (
        <PurgeConfirmModal event={purgeTarget} onConfirm={confirmPurge} onCancel={() => setPurgeTarget(null)} loading={actionLoading} />
      )}
      {redactTarget && (
        <RedactConfirmModal event={redactTarget} onConfirm={confirmRedact} onCancel={() => setRedactTarget(null)} loading={actionLoading} />
      )}
      {bulkPurgeOpen && (
        <BulkPurgeConfirmModal count={selectedIds.size} onConfirm={confirmBulkPurge} onCancel={() => { setBulkPurgeOpen(false); setBulkProgress(""); }} loading={actionLoading} progress={bulkProgress} />
      )}

      {/* Toast */}
      {toast && <Toast message={toast.message} type={toast.type} onDone={() => setToast(null)} />}
    </div>
  );
}
