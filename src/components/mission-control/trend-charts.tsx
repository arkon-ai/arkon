"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CardEntranceWrapper } from "./charts";
import { useTrendData, formatCompact, type TrendDay } from "./api";

function TrendTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[var(--text-secondary)]">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="font-semibold" style={{ color: p.color }}>
          {p.name}: {p.value.toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function formatDay(day: string) {
  const d = new Date(day + "T00:00:00");
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short" });
}

export function TrendCharts({ tenantId }: { tenantId?: string }) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const { data, loading } = useTrendData(range, tenantId);

  const trend = data?.trend ?? [];
  const totals = data?.totals ?? { received: 0, sent: 0, tools: 0, errors: 0, tokens: 0 };

  const chartData = trend.map((d: TrendDay) => ({
    day: formatDay(d.day),
    Messages: d.received + d.sent,
    "Tool Calls": d.tools,
    Errors: d.errors,
  }));

  const tokenData = trend.map((d: TrendDay) => ({
    day: formatDay(d.day),
    Tokens: d.tokens,
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="border-l-2 border-cyan pl-3 text-sm font-semibold uppercase tracking-[0.18em] text-text-dim">
          Trend Analysis
        </h2>
        <div className="flex gap-1 rounded-xl border border-border p-1">
          <button
            type="button"
            onClick={() => setRange("7d")}
            className={`btn-press rounded-lg px-3 py-1 text-xs font-semibold transition ${
              range === "7d" ? "bg-cyan/15 text-cyan" : "text-text-dim hover:text-text"
            }`}
          >
            7D
          </button>
          <button
            type="button"
            onClick={() => setRange("30d")}
            className={`btn-press rounded-lg px-3 py-1 text-xs font-semibold transition ${
              range === "30d" ? "bg-cyan/15 text-cyan" : "text-text-dim hover:text-text"
            }`}
          >
            30D
          </button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="card-hover rounded-2xl border border-border bg-bg-card px-3 py-2">
          <div className="text-sm font-semibold text-green">{formatCompact(totals.received)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">received</div>
        </div>
        <div className="card-hover rounded-2xl border border-border bg-bg-card px-3 py-2">
          <div className="text-sm font-semibold text-cyan">{formatCompact(totals.sent)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">sent</div>
        </div>
        <div className="card-hover rounded-2xl border border-border bg-bg-card px-3 py-2">
          <div className="text-sm font-semibold text-purple">{formatCompact(totals.tools)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">tools</div>
        </div>
        <div className="card-hover rounded-2xl border border-border bg-bg-card px-3 py-2">
          <div className="text-sm font-semibold text-red">{formatCompact(totals.errors)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">errors</div>
        </div>
        <div className="card-hover rounded-2xl border border-border bg-bg-card px-3 py-2">
          <div className="text-sm font-semibold text-amber">{formatCompact(totals.tokens)}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-dim">tokens</div>
        </div>
      </div>

      {loading && trend.length === 0 ? (
        <div className="h-48 animate-pulse rounded-2xl bg-border/30" />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Message volume chart */}
          <CardEntranceWrapper index={0}>
          <div className="card-hover rounded-[22px] border border-border bg-bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Message Volume
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00D47E" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00D47E" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="toolGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#00D47E" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#00D47E" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,42,74,0.4)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8888A0" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8888A0" }} width={40} />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Messages"
                  stroke="#00D47E"
                  fill="url(#msgGrad)"
                  strokeWidth={2}
                  activeDot={{ r: 4, fill: "#00D47E", strokeWidth: 0, style: { filter: "drop-shadow(0 0 6px rgba(0,212,126,0.5))" } }}
                />
                <Area
                  type="monotone"
                  dataKey="Tool Calls"
                  stroke="#00D47E"
                  fill="url(#toolGrad)"
                  strokeWidth={2}
                  activeDot={{ r: 4, fill: "#00D47E", strokeWidth: 0, style: { filter: "drop-shadow(0 0 6px rgba(0,212,126,0.5))" } }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </CardEntranceWrapper>

          {/* Token burn chart */}
          <CardEntranceWrapper index={1}>
          <div className="card-hover rounded-[22px] border border-border bg-bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.22)]">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-dim">
              Token Burn
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={tokenData}>
                <defs>
                  <linearGradient id="tokGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,42,74,0.4)" />
                <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8888A0" }} />
                <YAxis tick={{ fontSize: 10, fill: "#8888A0" }} width={50} />
                <Tooltip content={<TrendTooltip />} />
                <Area
                  type="monotone"
                  dataKey="Tokens"
                  stroke="#f59e0b"
                  fill="url(#tokGrad)"
                  strokeWidth={2}
                  activeDot={{ r: 4, fill: "#f59e0b", strokeWidth: 0, style: { filter: "drop-shadow(0 0 6px rgba(245,158,11,0.5))" } }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          </CardEntranceWrapper>
        </div>
      )}
    </div>
  );
}
