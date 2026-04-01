"use client";

import { useState, useEffect, useCallback, use } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { SpanTree } from "@/components/mission-control/span-tree";
import { SpanDetail } from "@/components/mission-control/span-detail";
import { ArrowLeft, Clock, Zap, Coins, Hash, Bot, CheckCircle, XCircle, AlertTriangle, Activity } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Trace {
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
  metadata: Record<string, unknown>;
}

export interface Span {
  span_id: string;
  parent_span_id: string | null;
  name: string | null;
  type: string;
  status: string;
  duration_ms: number | null;
  token_count: number;
  cost: number;
  input: unknown;
  output: unknown;
  metadata: Record<string, unknown>;
  error: string | null;
  started_at: string;
  ended_at: string | null;
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
  if (c === 0) return "$0.00";
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

function fmtTokens(t: number): string {
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M`;
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}K`;
  return String(t);
}

const STATUS_CONFIG: Record<string, { icon: typeof CheckCircle; color: string; label: string }> = {
  ok: { icon: CheckCircle, color: "#10B981", label: "Success" },
  error: { icon: XCircle, color: "#EF4444", label: "Error" },
  running: { icon: Activity, color: "#F59E0B", label: "Running" },
  timeout: { icon: AlertTriangle, color: "#F59E0B", label: "Timeout" },
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function TraceDetailPage({ params }: { params: Promise<{ traceId: string }> }) {
  const { traceId } = use(params);
  const [trace, setTrace] = useState<Trace | null>(null);
  const [spans, setSpans] = useState<Span[]>([]);
  const [selectedSpan, setSelectedSpan] = useState<Span | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchTrace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/traces/${traceId}`, {
        credentials: "include",
        headers: getAuthHeaders(),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      if (res.status === 404) { setTrace(null); setLoading(false); return; }
      const data = await res.json();
      setTrace(data.trace);
      setSpans(data.spans);
    } catch (err) {
      console.error("[trace-detail] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [traceId]);

  useEffect(() => { fetchTrace(); }, [fetchTrace]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-[var(--bg-surface-2)]" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)]" />
      </div>
    );
  }

  if (!trace) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-center">
        <p className="text-lg font-medium text-[var(--text-primary)]">Trace not found</p>
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">This trace may have expired or been deleted.</p>
        <Link href="/traces" className="mt-4 text-sm text-[var(--accent)] hover:underline">
          &larr; Back to traces
        </Link>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[trace.status] || STATUS_CONFIG.ok;
  const StatusIcon = cfg.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/traces"
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[rgba(0,212,126,0.25)] hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]" style={{ fontFamily: "'Urbanist', sans-serif" }}>
            {trace.name || "Unnamed Trace"}
          </h1>
          <p className="mt-0.5 font-mono text-xs text-[var(--text-tertiary)]">{trace.trace_id}</p>
        </div>
        <div className="ml-auto flex items-center gap-2 rounded-xl px-3 py-1.5" style={{ background: `${cfg.color}15` }}>
          <StatusIcon className="h-4 w-4" style={{ color: cfg.color }} />
          <span className="text-sm font-medium" style={{ color: cfg.color }}>{cfg.label}</span>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "DURATION", value: fmtDuration(trace.duration_ms), icon: Clock, color: "#E4E4ED" },
          { label: "SPANS", value: String(spans.length), icon: Hash, color: "#06B6D4" },
          { label: "TOKENS", value: fmtTokens(trace.token_count), icon: Zap, color: "#F59E0B" },
          { label: "COST", value: fmtCost(Number(trace.cost)), icon: Coins, color: "#00D47E" },
          { label: "AGENT", value: trace.agent_id || "—", icon: Bot, color: "#8888A0" },
        ].map((s) => (
          <motion.div
            key={s.label}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4"
          >
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <div className="flex items-center gap-2">
              <s.icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">{s.label}</span>
            </div>
            <p className="mt-2 font-mono text-lg font-bold" style={{ color: s.color }}>{s.value}</p>
          </motion.div>
        ))}
      </div>

      {/* Span Tree + Detail Split */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Span Tree (left 2/5) */}
        <div className="relative card-hover overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] lg:col-span-2">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <div className="border-b border-[var(--border)] px-4 py-3">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Span Tree</h3>
            <p className="text-[11px] text-[var(--text-tertiary)]">{spans.length} spans</p>
          </div>
          <div className="max-h-[600px] overflow-y-auto p-2">
            {spans.length === 0 ? (
              <p className="p-4 text-center text-sm text-[var(--text-tertiary)]">No spans recorded</p>
            ) : (
              <SpanTree
                spans={spans}
                selectedSpanId={selectedSpan?.span_id || null}
                onSelectSpan={setSelectedSpan}
                traceDuration={trace.duration_ms || 0}
              />
            )}
          </div>
        </div>

        {/* Span Detail (right 3/5) */}
        <div className="relative card-hover overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] lg:col-span-3">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          {selectedSpan ? (
            <SpanDetail span={selectedSpan} />
          ) : (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center">
              <Activity className="mb-3 h-10 w-10 text-[var(--border)]" />
              <p className="text-sm text-[var(--text-tertiary)]">Select a span to view details</p>
            </div>
          )}
        </div>
      </div>

      {/* Metadata */}
      {trace.metadata && Object.keys(trace.metadata).length > 0 && (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Trace Metadata</h3>
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg-primary)] p-3 font-mono text-xs text-[var(--text-secondary)]">
            {JSON.stringify(trace.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
