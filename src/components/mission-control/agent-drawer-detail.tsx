"use client";

import { useMemo } from "react";
import { Pause, OctagonX, X } from "lucide-react";
import {
  asNumber,
  formatCompact,
  formatFull,
  timeAgo,
  useAgentDetailData,
  type OverviewAgent,
} from "./api";
import { Avatar, bucketHourly, Kbd } from "./agents-kit";
import { Sparkline } from "./charts";
import { StatusPill } from "./ui-cards";
import type { ActiveRun } from "@/hooks/use-active-runs";

/**
 * AgentDrawerDetail — compact drawer-native agent detail per canonical brief.
 *
 * Used inside the canonical `Drawer` primitive (with `hideHeader`) on the
 * /agents Roster row click. Distinct from `AgentDetailScreen` (which is the
 * full-page /agent/[id] route layout). transformate WI-392 / PR-7.
 *
 * Layout (top to bottom):
 *   - Header: Avatar + name + StatusPill + close X
 *   - Meta grid: Model | Tenant
 *   - Meta grid: Role | Last active
 *   - KPI row: Events 24h | Tokens 24h | Cost 30d (compact KPI sizing)
 *   - Sparkline (24h activity from agent events)
 *   - Recent activity list (event_type · status · relative time)
 *   - Sticky bottom actions: Pause (disabled) | Kill agent
 *
 * Real-data Rule 12: missing/error values render "—" + telemetry-pending sub-text.
 * Palette: NO cyan, NO purple, NO pink. Red reserved for Kill action only.
 */

export function AgentDrawerDetail({
  agentId,
  overviewAgent,
  tenantName,
  model,
  statusTone,
  statusLabel,
  activeRun,
  onClose,
  onKill,
}: {
  agentId: string;
  overviewAgent: OverviewAgent | undefined;
  tenantName: string;
  model: string;
  statusTone: "live" | "warm" | "idle" | "err";
  statusLabel: string;
  activeRun?: ActiveRun;
  onClose: () => void;
  onKill: (run: ActiveRun) => void;
}) {
  const { data, loading, error } = useAgentDetailData(agentId);

  const role = (overviewAgent?.metadata?.role ?? "") as string;

  const events24h = asNumber(overviewAgent?.events_24h);
  const tokens24h = asNumber(overviewAgent?.tokens_24h);
  const cost30d = Number(overviewAgent?.cost_30d ?? 0);

  const recentEvents = useMemo(() => (data?.events ?? []).slice(0, 8), [data]);
  const sparkData = useMemo(
    () => bucketHourly((data?.events ?? []).map((e) => e.created_at)),
    [data]
  );

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)]/50 px-5 py-4">
        <Avatar
          name={overviewAgent?.name ?? agentId}
          persona={(overviewAgent?.name ?? agentId).toLowerCase()}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-[var(--text-primary)]">
            {overviewAgent?.name ?? agentId}
          </h2>
        </div>
        <StatusPill status={statusTone}>{statusLabel}</StatusPill>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-white/[0.04] hover:text-[var(--text-primary)]"
          aria-label="Close drawer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* Meta grid: Model + Tenant */}
        <div className="grid grid-cols-2 gap-4 pb-4">
          <MetaCell label="Model" value={model} mono />
          <MetaCell label="Tenant" value={tenantName} mono />
        </div>

        {/* Meta grid: Role + Last active */}
        <div className="grid grid-cols-2 gap-4 border-t border-[var(--border)]/50 pb-4 pt-4">
          <div>
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              Role
            </div>
            {role ? (
              <span className="inline-flex items-center rounded-md border border-[var(--border)] bg-[var(--bg-surface-2)] px-2 py-0.5 text-[12px] font-medium text-[var(--text-secondary)]">
                {role}
              </span>
            ) : (
              <span className="text-[12px] text-[var(--text-tertiary)]">—</span>
            )}
          </div>
          <MetaCell
            label="Last active"
            value={
              overviewAgent?.last_active
                ? timeAgo(overviewAgent.last_active)
                : "—"
            }
            tone={overviewAgent?.last_active ? "primary" : "tertiary"}
          />
        </div>

        {/* KPI row — compact (text-[20px], smaller than card KPIs) */}
        <div className="grid grid-cols-3 gap-4 border-t border-[var(--border)]/50 pb-4 pt-4">
          <Kpi
            label="Events 24h"
            value={events24h > 0 ? formatFull(events24h) : "—"}
            dim={events24h === 0}
          />
          <Kpi
            label="Tokens 24h"
            value={tokens24h > 0 ? formatCompact(tokens24h) : "—"}
            dim={tokens24h === 0}
          />
          <Kpi
            label="Cost 30d"
            value={
              cost30d >= 0.01
                ? `$${cost30d.toFixed(cost30d < 1 ? 3 : 2)}`
                : cost30d > 0
                ? "<$0.01"
                : "—"
            }
            dim={cost30d <= 0}
          />
        </div>

        {/* Sparkline */}
        <div className="border-t border-[var(--border)]/50 pb-4 pt-4">
          {sparkData.length > 0 ? (
            <div className="h-12">
              <Sparkline data={sparkData} />
            </div>
          ) : (
            <div className="flex h-12 items-center justify-center font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              {loading ? "Loading activity…" : "No recent activity"}
            </div>
          )}
        </div>

        {/* Recent activity */}
        <div className="border-t border-[var(--border)]/50 pt-4">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            Recent activity
          </div>
          {error ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              Telemetry pending — {error}
            </p>
          ) : recentEvents.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">
              {loading ? "Loading…" : "No events recorded"}
            </p>
          ) : (
            <ul className="space-y-1">
              {recentEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center justify-between gap-3 rounded px-2 py-1.5 text-[12px] hover:bg-[var(--bg-surface-2)]"
                >
                  <span className="truncate font-mono text-[var(--text-secondary)]">
                    {ev.event_type}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-emerald-300">
                    ok
                  </span>
                  <span className="shrink-0 text-[11px] text-[var(--text-tertiary)]">
                    {timeAgo(ev.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Sticky bottom actions */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--border)]/50 px-5 py-3">
        <button
          type="button"
          disabled
          className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] font-medium text-[var(--text-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
          title="Pause (not yet wired)"
        >
          <Pause className="h-3.5 w-3.5" /> Pause
        </button>
        <button
          type="button"
          onClick={() => {
            if (activeRun) onKill(activeRun);
          }}
          disabled={!activeRun}
          className="flex items-center gap-1.5 rounded-xl border border-red-500/40 bg-red-600/20 px-3 py-2 text-[12px] font-semibold text-red-200 transition hover:bg-red-600/40 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-red-600/20"
          title={activeRun ? "Kill active run" : "No active run"}
        >
          <OctagonX className="h-3.5 w-3.5" />
          Kill agent
          <Kbd>K</Kbd>
        </button>
      </div>
    </div>
  );
}

function MetaCell({
  label,
  value,
  mono = false,
  tone = "primary",
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: "primary" | "secondary" | "tertiary";
}) {
  const toneClass =
    tone === "tertiary"
      ? "text-[var(--text-tertiary)]"
      : tone === "secondary"
      ? "text-[var(--text-secondary)]"
      : "text-[var(--text-primary)]";
  return (
    <div>
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </div>
      <div className={`${mono ? "font-mono" : ""} text-[13px] ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  dim = false,
}: {
  label: string;
  value: string;
  dim?: boolean;
}) {
  return (
    <div>
      <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </div>
      <div
        className={`font-mono text-[20px] font-medium leading-none tracking-normal ${
          dim ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
