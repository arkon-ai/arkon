"use client";

import { useState } from "react";
import type { Span } from "@/app/traces/[traceId]/page";
import { Clock, Zap, Coins, Hash, AlertTriangle, Code, FileOutput, Settings } from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function fmtTokens(t: number): string {
  if (t >= 1_000) return `${(t / 1_000).toFixed(1)}K`;
  return String(t);
}

function fmtCost(c: number): string {
  if (c === 0) return "$0.00";
  if (c < 0.01) return `$${c.toFixed(4)}`;
  return `$${c.toFixed(3)}`;
}

const TYPE_LABELS: Record<string, string> = {
  llm: "LLM Call",
  tool: "Tool Execution",
  retrieval: "Retrieval",
  chain: "Chain",
  agent: "Agent",
};

// ── Tabs ──────────────────────────────────────────────────────────────────────
type Tab = "overview" | "input" | "output" | "metadata";

const TABS: Array<{ key: Tab; label: string; icon: typeof Code }> = [
  { key: "overview", label: "Overview", icon: Settings },
  { key: "input", label: "Input", icon: Code },
  { key: "output", label: "Output", icon: FileOutput },
  { key: "metadata", label: "Metadata", icon: Hash },
];

// ── Component ─────────────────────────────────────────────────────────────────
export function SpanDetail({ span }: { span: Span }) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const isError = span.status === "error";

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">{span.name || "Unnamed Span"}</h3>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-[var(--text-secondary)]" style={{ background: "rgba(136,136,160,0.1)" }}>
            {TYPE_LABELS[span.type] || span.type}
          </span>
        </div>
        <p className="mt-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">{span.span_id}</p>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[var(--border)]">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? "border-b-2 border-[var(--accent)] text-[var(--accent)]"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              }`}
            >
              <Icon className="h-3 w-3" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "overview" && (
          <div className="space-y-4">
            {/* Error banner */}
            {isError && span.error && (
              <div className="flex items-start gap-3 rounded-xl border border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.06)] p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--danger)]" />
                <div>
                  <p className="text-xs font-semibold text-[var(--danger)]">Error</p>
                  <p className="mt-1 font-mono text-xs text-[var(--danger)]/80">{span.error}</p>
                </div>
              </div>
            )}

            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Duration", value: fmtDuration(span.duration_ms), icon: Clock, color: "#E4E4ED" },
                { label: "Tokens", value: fmtTokens(span.token_count), icon: Zap, color: "#F59E0B" },
                { label: "Cost", value: fmtCost(Number(span.cost)), icon: Coins, color: "#00D47E" },
                { label: "Status", value: span.status.toUpperCase(), icon: Hash, color: isError ? "#EF4444" : "#10B981" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                  <div className="flex items-center gap-1.5">
                    <s.icon className="h-3 w-3 text-[var(--text-tertiary)]" />
                    <span className="text-[10px] uppercase tracking-widest text-[var(--text-tertiary)]">{s.label}</span>
                  </div>
                  <p className="mt-1.5 font-mono text-sm font-semibold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Details */}
            <div className="space-y-2">
              {[
                { label: "Type", value: TYPE_LABELS[span.type] || span.type },
                { label: "Span ID", value: span.span_id },
                { label: "Parent Span", value: span.parent_span_id || "Root" },
                { label: "Started", value: span.started_at ? new Date(span.started_at).toLocaleString() : "—" },
                { label: "Ended", value: span.ended_at ? new Date(span.ended_at).toLocaleString() : "—" },
              ].map((d) => (
                <div key={d.label} className="flex items-baseline justify-between">
                  <span className="text-xs text-[var(--text-tertiary)]">{d.label}</span>
                  <span className="font-mono text-xs text-[var(--text-secondary)]">{d.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "input" && (
          <div>
            {span.input ? (
              <pre className="overflow-x-auto rounded-xl bg-[var(--bg-primary)] p-4 font-mono text-xs text-[var(--text-secondary)]">
                {typeof span.input === "string" ? span.input : JSON.stringify(span.input, null, 2)}
              </pre>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">No input data recorded</p>
            )}
          </div>
        )}

        {activeTab === "output" && (
          <div>
            {span.output ? (
              <pre className="overflow-x-auto rounded-xl bg-[var(--bg-primary)] p-4 font-mono text-xs text-[var(--text-secondary)]">
                {typeof span.output === "string" ? span.output : JSON.stringify(span.output, null, 2)}
              </pre>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">No output data recorded</p>
            )}
          </div>
        )}

        {activeTab === "metadata" && (
          <div>
            {span.metadata && Object.keys(span.metadata).length > 0 ? (
              <pre className="overflow-x-auto rounded-xl bg-[var(--bg-primary)] p-4 font-mono text-xs text-[var(--text-secondary)]">
                {JSON.stringify(span.metadata, null, 2)}
              </pre>
            ) : (
              <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">No metadata recorded</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
