"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, AreaChart, Area, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";
import { Gauge, Scale } from "lucide-react";
import { EmptyCard } from "./ui-cards";
import { SectionDescription } from "./dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

const C = {
  green: "#00D47E", purple: "#00D47E", amber: "#f59e0b",
  red: "#ef4444", slate: "#8888A0", teal: "#14b8a6",
  pink: "#ec4899", blue: "#3b82f6",
  grid: "#1E1E2A", tooltipBg: "#111118",
};
const MODEL_COLORS = [C.green, C.purple, C.amber, C.teal, C.pink, C.blue, C.red, C.slate];

function fmt$(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`;
  if (v >= 0.01) return `$${v.toFixed(3)}`;
  return `$${v.toFixed(6)}`;
}
function fmtMs(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`;
  return `${v}ms`;
}
function fmtK(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return String(v);
}

interface BenchmarkSummary {
  total_runs: number;
  models_tested: number;
  unique_prompts: number;
  avg_latency_ms: number;
  avg_quality: number;
  total_cost: number;
  total_tokens: number;
}
interface ModelBreakdown {
  model_id: string; model_provider: string; runs: number;
  avg_latency_ms: number; min_latency_ms: number; max_latency_ms: number;
  p50_latency_ms: number; p95_latency_ms: number;
  avg_quality: number; avg_cost: number; total_cost: number;
  avg_tokens: number; avg_output_tokens: number;
}
interface DailyTrend { day: string; runs: number; avg_latency_ms: number; avg_quality: number; cost: number }
interface RecentRun {
  id: number; model_id: string; model_provider: string; prompt_label: string;
  latency_ms: number; total_tokens: number; cost_usd: number; quality_score: number;
  created_at: string;
}
interface OverviewData {
  summary: BenchmarkSummary;
  byModel: ModelBreakdown[];
  dailyTrend: DailyTrend[];
  recent: RecentRun[];
}

async function apiFetch<T>(url: string): Promise<T> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-csrf-token": csrf },
  });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"
    >
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{sub}</p>}
    </motion.div>
  );
}

export function BenchmarksDashboard() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [range, setRange] = useState("30d");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "compare">("overview");

  useEffect(() => {
    let mounted = true;
    setError(null);
    apiFetch<OverviewData>(`/api/benchmarks/overview?range=${range}`)
      .then((d) => { if (mounted) setData(d); })
      .catch((e) => { if (mounted) setError(e.message); });
    return () => { mounted = false; };
  }, [range]);

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
        <p className="text-red-400">Failed to load benchmarks: {error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--bg-surface)]" />
        ))}
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-6">
      <SectionDescription id="benchmarks">
        Compare agent performance across models, response times, and cost efficiency.
        Use this to identify which models deliver the best value for different task types.
      </SectionDescription>

      {/* Header + range selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(["overview", "compare"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
                tab === t ? "bg-[rgba(0,212,126,0.15)] text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >{t === "overview" ? "Overview" : "Compare Models"}</button>
          ))}
        </div>
        <div className="flex gap-1 rounded-xl bg-[var(--bg-surface)] p-1">
          {["24h", "7d", "30d"].map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                range === r ? "bg-[var(--bg-surface-2)] text-white" : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              }`}
            >{r}</button>
          ))}
        </div>
      </div>

      {tab === "overview" ? (
        <OverviewTab data={data} />
      ) : (
        <CompareTab models={data.byModel} />
      )}
    </div>
  );
}

function OverviewTab({ data }: { data: OverviewData }) {
  const s = data.summary;

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Runs" value={String(s.total_runs)} sub={`${s.models_tested} models, ${s.unique_prompts} prompts`} />
        <StatCard label="Avg Latency" value={fmtMs(s.avg_latency_ms)} />
        <StatCard label="Avg Quality" value={`${Number(s.avg_quality).toFixed(1)}/10`} />
        <StatCard label="Total Cost" value={fmt$(Number(s.total_cost))} sub={fmtK(Number(s.total_tokens)) + " tokens"} />
      </div>

      {/* Model comparison bars */}
      {data.byModel.length > 0 && (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Latency by Model (avg ms)</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byModel} layout="vertical" margin={{ left: 120 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
                <XAxis type="number" stroke={C.slate} tick={{ fill: C.slate, fontSize: 11 }} />
                <YAxis type="category" dataKey="model_id" stroke={C.grid} tick={{ fill: "#cbd5e1", fontSize: 11 }} width={110} />
                <Tooltip
                  contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.grid}`, borderRadius: 12, fontSize: 12 }}
                  formatter={(v: unknown) => [fmtMs(Number(v)), "Avg Latency"]}
                />
                <Bar dataKey="avg_latency_ms" radius={[0, 6, 6, 0]}>
                  {data.byModel.map((_, i) => (
                    <Cell key={i} fill={MODEL_COLORS[i % MODEL_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Daily trend */}
      {data.dailyTrend.length > 0 && (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Daily Benchmark Activity</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.dailyTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
                <XAxis dataKey="day" stroke={C.slate} tick={{ fill: C.slate, fontSize: 10 }}
                  tickFormatter={(v: string) => v.slice(5)} />
                <YAxis stroke={C.grid} tick={{ fill: C.slate, fontSize: 10 }} />
                <Tooltip contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.grid}`, borderRadius: 12, fontSize: 12 }} />
                <Area type="monotone" dataKey="runs" stroke={C.green} fill={C.green} fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Model table */}
      {data.byModel.length > 0 && (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Model Breakdown</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                  <th className="pb-3 pr-4">Model</th>
                  <th className="pb-3 pr-4">Provider</th>
                  <th className="pb-3 pr-4 text-right">Runs</th>
                  <th className="pb-3 pr-4 text-right">P50</th>
                  <th className="pb-3 pr-4 text-right">P95</th>
                  <th className="pb-3 pr-4 text-right">Quality</th>
                  <th className="pb-3 pr-4 text-right">Avg Cost</th>
                  <th className="pb-3 text-right">Avg Tokens</th>
                </tr>
              </thead>
              <tbody>
                {data.byModel.map((m, i) => (
                  <tr key={m.model_id} className="border-b border-[var(--border)]/50 text-[var(--text-primary)]">
                    <td className="py-3 pr-4 font-medium text-white">
                      <span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                      {m.model_id}
                    </td>
                    <td className="py-3 pr-4 text-[var(--text-secondary)]">{m.model_provider}</td>
                    <td className="py-3 pr-4 text-right">{m.runs}</td>
                    <td className="py-3 pr-4 text-right">{fmtMs(m.p50_latency_ms)}</td>
                    <td className="py-3 pr-4 text-right">{fmtMs(m.p95_latency_ms)}</td>
                    <td className="py-3 pr-4 text-right">{Number(m.avg_quality).toFixed(1)}</td>
                    <td className="py-3 pr-4 text-right">{fmt$(Number(m.avg_cost))}</td>
                    <td className="py-3 text-right">{fmtK(m.avg_tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent runs */}
      {data.recent.length > 0 && (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Recent Benchmark Runs</h3>
          <div className="space-y-2">
            {data.recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-xl bg-white/[0.02] px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white">{r.model_id}</span>
                  {r.prompt_label && <span className="text-[var(--text-tertiary)]">{r.prompt_label}</span>}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--text-secondary)]">
                  <span>{fmtMs(r.latency_ms)}</span>
                  <span>{fmtK(r.total_tokens)} tok</span>
                  <span>{fmt$(Number(r.cost_usd))}</span>
                  {r.quality_score != null && (
                    <span className={Number(r.quality_score) >= 7 ? "text-[var(--accent)]" : Number(r.quality_score) >= 4 ? "text-amber-400" : "text-red-400"}>
                      Q{Number(r.quality_score).toFixed(1)}
                    </span>
                  )}
                  <span>{new Date(r.created_at).toLocaleTimeString()}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {data.byModel.length === 0 && (
        <EmptyCard
          icon={Gauge}
          title="No Benchmark Data Yet"
          description="Benchmark data populates automatically as your agents process requests. Once active, you'll see model comparison charts here."
          action="Learn more"
          actionHref="/tools/docs"
        />
      )}
    </div>
  );
}

function CompareTab({ models }: { models: ModelBreakdown[] }) {
  if (models.length < 2) {
    return (
      <EmptyCard
        icon={Scale}
        title="Need 2+ Models to Compare"
        description="Record benchmarks for at least two different models to see side-by-side comparisons of latency, cost, and quality."
      />
    );
  }

  // Normalize metrics for radar-style comparison
  const maxLatency = Math.max(...models.map((m) => m.p95_latency_ms), 1);
  const maxCost = Math.max(...models.map((m) => Number(m.avg_cost)), 0.000001);
  const maxTokens = Math.max(...models.map((m) => m.avg_tokens), 1);

  return (
    <div className="space-y-6">
      {/* Side-by-side comparison cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {models.map((m, i) => (
          <motion.div key={m.model_id}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"
          >
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <div className="flex items-center gap-2 mb-4">
              <span className="h-3 w-3 rounded-full" style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }} />
              <span className="font-semibold text-white">{m.model_id}</span>
              <span className="text-xs text-[var(--text-tertiary)]">{m.model_provider}</span>
            </div>
            <div className="space-y-3 text-sm">
              <MetricBar label="Latency (P50)" value={m.p50_latency_ms} max={maxLatency} format={fmtMs} color={MODEL_COLORS[i % MODEL_COLORS.length]} />
              <MetricBar label="Latency (P95)" value={m.p95_latency_ms} max={maxLatency} format={fmtMs} color={MODEL_COLORS[i % MODEL_COLORS.length]} />
              <MetricBar label="Avg Cost" value={Number(m.avg_cost)} max={maxCost} format={fmt$} color={C.amber} />
              <MetricBar label="Avg Tokens" value={m.avg_tokens} max={maxTokens} format={fmtK} color={C.teal} />
              <div className="flex justify-between pt-2 border-t border-[var(--border)]">
                <span className="text-[var(--text-tertiary)]">Quality</span>
                <span className={Number(m.avg_quality) >= 7 ? "text-[var(--accent)]" : Number(m.avg_quality) >= 4 ? "text-amber-400" : "text-red-400"}>
                  {Number(m.avg_quality).toFixed(1)}/10
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Runs</span>
                <span className="text-white">{m.runs}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-tertiary)]">Total Cost</span>
                <span className="text-white">{fmt$(Number(m.total_cost))}</span>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Latency comparison chart */}
      <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        <h3 className="mb-4 text-sm font-semibold text-[var(--text-primary)]">Latency Distribution (P50 vs P95 vs P99)</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={models} margin={{ left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="model_id" stroke={C.slate} tick={{ fill: C.slate, fontSize: 10 }} />
              <YAxis stroke={C.grid} tick={{ fill: C.slate, fontSize: 10 }} tickFormatter={(v: number) => fmtMs(v)} />
              <Tooltip
                contentStyle={{ background: C.tooltipBg, border: `1px solid ${C.grid}`, borderRadius: 12, fontSize: 12 }}
                formatter={(v: unknown, name: unknown) => [fmtMs(Number(v)), String(name)]}
              />
              <Bar dataKey="p50_latency_ms" name="P50" fill={C.green} radius={[4, 4, 0, 0]} />
              <Bar dataKey="p95_latency_ms" name="P95" fill={C.amber} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function MetricBar({ label, value, max, format, color }: {
  label: string; value: number; max: number; format: (v: number) => string; color: string;
}) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex justify-between mb-1">
        <span className="text-[var(--text-tertiary)]">{label}</span>
        <span className="text-white">{format(value)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-white/5">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6 }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
    </div>
  );
}
