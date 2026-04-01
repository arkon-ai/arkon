"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { SectionDescription } from "@/components/mission-control/dashboard-clarity";
import { Search, Filter, Clock, Zap, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronRight, Activity } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TraceRow {
  trace_id: string;
  agent_id: string | null;
  tenant_id: string | null;
  name: string | null;
  status: string;
  duration_ms: number | null;
  token_count: number;
  cost: number;
  started_at: string;
  ended_at: string | null;
  span_count: number;
  metadata: Record<string, unknown>;
}

interface TracesResponse {
  traces: TraceRow[];
  total: number;
  limit: number;
  offset: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function fmtCost(c: number): string {
  if (c === 0) return "$0";
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

function fmtTokens(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}K`;
  return String(t);
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; bg: string }> = {
  ok: { icon: CheckCircle, color: "#10B981", bg: "rgba(16, 185, 129, 0.1)" },
  error: { icon: XCircle, color: "#EF4444", bg: "rgba(239, 68, 68, 0.1)" },
  running: { icon: Activity, color: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)" },
  timeout: { icon: AlertTriangle, color: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)" },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function TracesPage() {
  const router = useRouter();
  const [traces, setTraces] = useState<TraceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [agentFilter, setAgentFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const fetchTraces = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      params.set("offset", String(offset));
      if (search) params.set("q", search);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (agentFilter) params.set("agent_id", agentFilter);

      const res = await fetch(`/api/traces?${params}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const data: TracesResponse = await res.json();
      setTraces(data.traces);
      setTotal(data.total);
    } catch (err) {
      console.error("[traces] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [offset, search, statusFilter, agentFilter]);

  useEffect(() => { fetchTraces(); }, [fetchTraces]);

  // Stats
  const stats = useMemo(() => {
    const totalTokens = traces.reduce((s, t) => s + t.token_count, 0);
    const totalCost = traces.reduce((s, t) => s + Number(t.cost), 0);
    const avgDuration = traces.length > 0
      ? traces.reduce((s, t) => s + (t.duration_ms || 0), 0) / traces.length
      : 0;
    const errorCount = traces.filter((t) => t.status === "error").length;
    return { totalTokens, totalCost, avgDuration, errorCount };
  }, [traces]);

  const uniqueAgents = useMemo(() => {
    const set = new Set(traces.map((t) => t.agent_id).filter(Boolean));
    return Array.from(set) as string[];
  }, [traces]);

  return (
    <div className="space-y-6">
      <SectionDescription id="traces">Inspect agent execution traces, spans, and LLM calls across your infrastructure.</SectionDescription>

      {/* Stats Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "TOTAL TRACES", value: String(total), color: "#E4E4ED" },
          { label: "AVG DURATION", value: fmtDuration(stats.avgDuration), color: "#00D47E" },
          { label: "TOKENS USED", value: fmtTokens(stats.totalTokens), color: "#06B6D4" },
          { label: "ERRORS", value: String(stats.errorCount), color: stats.errorCount > 0 ? "#EF4444" : "#10B981" },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"
          >
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{s.label}</p>
            <p className="mt-1.5 font-mono text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Search & Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            placeholder="Search traces..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setOffset(0); }}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] py-2.5 pl-10 pr-4 text-sm text-[var(--text-primary)] placeholder-[#555566] outline-none focus:border-[rgba(0,212,126,0.25)]"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[rgba(0,212,126,0.25)] hover:text-[var(--text-primary)]"
          >
            <Filter className="h-4 w-4" />
            Filters
            <ChevronDown className={`h-3 w-3 transition-transform ${showFilters ? "rotate-180" : ""}`} />
          </button>
          <button
            onClick={fetchTraces}
            className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="flex flex-wrap gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="all">All</option>
                  <option value="ok">OK</option>
                  <option value="error">Error</option>
                  <option value="running">Running</option>
                  <option value="timeout">Timeout</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[11px] uppercase tracking-widest text-[var(--text-tertiary)]">Agent</label>
                <select
                  value={agentFilter}
                  onChange={(e) => { setAgentFilter(e.target.value); setOffset(0); }}
                  className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value="">All Agents</option>
                  {uniqueAgents.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Trace Table */}
      <div className="relative card-hover overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]">
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Agent</th>
                <th className="px-4 py-3 font-semibold text-right">Duration</th>
                <th className="px-4 py-3 font-semibold text-right">Spans</th>
                <th className="px-4 py-3 font-semibold text-right">Tokens</th>
                <th className="px-4 py-3 font-semibold text-right">Cost</th>
                <th className="px-4 py-3 font-semibold text-right">When</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-[var(--border)]/50">
                    <td colSpan={8} className="px-4 py-4">
                      <div className="h-4 animate-pulse rounded bg-[var(--bg-surface-2)]" style={{ width: `${60 + Math.random() * 30}%` }} />
                    </td>
                  </tr>
                ))
              ) : traces.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-[var(--text-tertiary)]">
                    No traces found. Traces are recorded when agents execute operations.
                  </td>
                </tr>
              ) : (
                traces.map((trace) => {
                  const cfg = STATUS_CONFIG[trace.status] || STATUS_CONFIG.ok;
                  const Icon = cfg.icon;
                  return (
                    <tr
                      key={trace.trace_id}
                      onClick={() => router.push(`/traces/${trace.trace_id}`)}
                      className="cursor-pointer border-b border-[var(--border)]/50 transition-colors hover:bg-[rgba(0,212,126,0.03)]"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="rounded-lg p-1" style={{ background: cfg.bg }}>
                            <Icon className="h-3.5 w-3.5" style={{ color: cfg.color }} />
                          </div>
                          <span className="text-xs capitalize" style={{ color: cfg.color }}>{trace.status}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--text-primary)]">{trace.name || "Unnamed trace"}</span>
                        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">{trace.trace_id.slice(0, 8)}</p>
                      </td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{trace.agent_id || "—"}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--text-primary)]">{fmtDuration(trace.duration_ms)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)]">{trace.span_count}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--text-secondary)]">{fmtTokens(trace.token_count)}</td>
                      <td className="px-4 py-3 text-right font-mono text-[var(--accent)]">{fmtCost(Number(trace.cost))}</td>
                      <td className="px-4 py-3 text-right text-[var(--text-tertiary)]">{relativeTime(trace.started_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {total > limit && (
          <div className="flex items-center justify-between border-t border-[var(--border)] px-4 py-3">
            <span className="text-xs text-[var(--text-tertiary)]">
              {offset + 1}–{Math.min(offset + limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[rgba(0,212,126,0.25)] disabled:opacity-30"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:border-[rgba(0,212,126,0.25)] disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
