"use client";

import { useEffect, useState } from "react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

interface CostData {
  summary: { total_cost_usd: number; total_tokens: number; active_agents: number; range: string };
  daily_trend: Array<{ day: string; cost: number; tokens: number }>;
  by_agent: Array<{ agent_id: string; agent_name: string; cost: number; tokens: number }>;
  budgets: Array<{ scope_type: string; daily_limit_usd: number; monthly_limit_usd: number; today_spend: number; month_spend: number }>;
}

const ranges = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

export function ClientCosts() {
  const [data, setData] = useState<CostData | null>(null);
  const [range, setRange] = useState("30d");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch(`/api/client/costs?range=${range}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as CostData;
        if (mounted) { setData(d); setLoading(false); }
      } catch (err) {
        if (mounted) { setError(err instanceof Error ? err.message : "Failed to load"); setLoading(false); }
      }
    };
    load();
    return () => { mounted = false; };
  }, [range]);

  if (loading && !data) return <div className="text-center text-[var(--text-tertiary)] py-20"><p className="animate-pulse">Loading costs...</p></div>;
  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center"><p className="text-red-400">{error}</p></div>;
  if (!data) return null;

  const maxCost = Math.max(...data.daily_trend.map((d) => d.cost), 0.001);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">Costs</h1>
        <div className="flex gap-1 rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] p-1">
          {ranges.map((r) => (
            <button
              key={r.value}
              onClick={() => setRange(r.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                range === r.value ? "bg-cyan-500/20 text-cyan-400" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="relative card-hover rounded-2xl border border-amber-500/20 bg-[var(--bg-primary)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Total Cost</p>
          <p className="mt-1 text-2xl font-bold text-amber-400">${data.summary.total_cost_usd.toFixed(4)}</p>
        </div>
        <div className="relative card-hover rounded-2xl border border-cyan-500/20 bg-[var(--bg-primary)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Total Tokens</p>
          <p className="mt-1 text-2xl font-bold text-cyan-400">{data.summary.total_tokens.toLocaleString()}</p>
        </div>
        <div className="relative card-hover rounded-2xl border border-[var(--accent)]/20 bg-[var(--bg-primary)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Active Agents</p>
          <p className="mt-1 text-2xl font-bold text-[var(--accent)]">{data.summary.active_agents}</p>
        </div>
      </div>

      {/* Daily trend chart (simple bars) */}
      {data.daily_trend.length > 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Daily Spend</h2>
          <div className="flex items-end gap-1" style={{ height: 120 }}>
            {data.daily_trend.map((d) => {
              const h = Math.max((d.cost / maxCost) * 100, 2);
              const day = new Date(d.day).toLocaleDateString("en-ZA", { month: "short", day: "numeric" });
              return (
                <div key={d.day} className="group relative flex flex-1 flex-col items-center">
                  <div className="absolute -top-8 hidden rounded bg-[var(--bg-surface-2)] px-2 py-1 text-[10px] text-white group-hover:block whitespace-nowrap">
                    {day}: ${d.cost.toFixed(4)}
                  </div>
                  <div
                    className="w-full rounded-t bg-gradient-to-t from-cyan-600 to-cyan-400 transition-all group-hover:from-cyan-500 group-hover:to-cyan-300"
                    style={{ height: `${h}%`, minHeight: 2 }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-[var(--text-tertiary)]">
            {data.daily_trend.length > 0 ? (
              <>
                <span>{new Date(data.daily_trend[0].day).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}</span>
                <span>{new Date(data.daily_trend[data.daily_trend.length - 1].day).toLocaleDateString("en-ZA", { month: "short", day: "numeric" })}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Cost by agent */}
      {data.by_agent.length > 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Cost by Agent</h2>
          <div className="space-y-2">
            {data.by_agent.map((a) => (
              <div key={a.agent_id} className="flex items-center justify-between rounded-xl bg-[var(--bg-primary)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{a.agent_name || a.agent_id}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{a.tokens.toLocaleString()} tokens</p>
                </div>
                <p className="text-sm font-bold text-amber-400">${a.cost.toFixed(4)}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Budget status */}
      {data.budgets.length > 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Budget Limits</h2>
          <div className="space-y-3">
            {data.budgets.map((b, i) => {
              const dailyPct = b.daily_limit_usd > 0 ? (Number(b.today_spend) / b.daily_limit_usd) * 100 : 0;
              const monthPct = b.monthly_limit_usd > 0 ? (Number(b.month_spend) / b.monthly_limit_usd) * 100 : 0;
              return (
                <div key={i} className="rounded-xl bg-[var(--bg-primary)] px-4 py-3">
                  <p className="text-sm font-medium text-white">{b.scope_type} budget</p>
                  {b.daily_limit_usd > 0 ? (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
                        <span>Daily: ${Number(b.today_spend).toFixed(4)} / ${b.daily_limit_usd.toFixed(2)}</span>
                        <span>{dailyPct.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--bg-surface-2)]">
                        <div className={`h-full rounded-full transition-all ${dailyPct > 80 ? "bg-red-500" : dailyPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(dailyPct, 100)}%` }} />
                      </div>
                    </div>
                  ) : null}
                  {b.monthly_limit_usd > 0 ? (
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-[var(--text-tertiary)]">
                        <span>Monthly: ${Number(b.month_spend).toFixed(4)} / ${b.monthly_limit_usd.toFixed(2)}</span>
                        <span>{monthPct.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-[var(--bg-surface-2)]">
                        <div className={`h-full rounded-full transition-all ${monthPct > 80 ? "bg-red-500" : monthPct > 50 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(monthPct, 100)}%` }} />
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
