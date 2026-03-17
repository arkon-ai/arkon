"use client";

import Link from "next/link";
import { PulsingDot } from "./charts";
import {
  activityStatus,
  asNumber,
  formatCompact,
  timeAgo,
  type OverviewAgent,
  type OverviewData,
  type Tenant,
} from "./api";

function getTenantHealth(agents: OverviewAgent[]) {
  if (agents.length === 0) return { label: "Empty", tone: "text-text-dim", dot: "idle" as const };
  const statuses = agents.map((a) => activityStatus(a.last_active).label);
  if (statuses.some((s) => s === "Live")) return { label: "Healthy", tone: "text-green", dot: "live" as const };
  if (statuses.some((s) => s === "Warm")) return { label: "Warm", tone: "text-amber", dot: "warm" as const };
  return { label: "Idle", tone: "text-text-dim", dot: "idle" as const };
}

export function TenantCards({ data }: { data: OverviewData | null }) {
  const tenants = data?.tenants ?? [];
  const agents = data?.agents ?? [];

  if (tenants.length === 0) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <h2 className="border-l-2 border-cyan pl-3 text-sm font-semibold uppercase tracking-[0.18em] text-text-dim">
          Clients
        </h2>
        <p className="text-xs text-text-dim">{tenants.length} tenant(s)</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {tenants.map((tenant: Tenant) => {
          const tenantAgents = agents.filter((a) => a.tenant_id === tenant.id);
          const health = getTenantHealth(tenantAgents);
          const totalEvents24h = tenantAgents.reduce((sum, a) => sum + asNumber(a.events_24h), 0);
          const totalTokens24h = tenantAgents.reduce((sum, a) => sum + asNumber(a.tokens_24h), 0);
          const lastActive = tenantAgents
            .map((a) => a.last_active)
            .filter(Boolean)
            .sort()
            .pop() ?? null;

          return (
            <div
              key={tenant.id}
              className="card-hover rounded-[22px] border border-border bg-bg-card p-4 shadow-[0_10px_40px_rgba(0,0,0,0.22)] transition hover:border-cyan/30"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <PulsingDot status={health.dot} />
                    <h3 className="text-base font-semibold text-text">{tenant.name}</h3>
                  </div>
                  {tenant.domain && (
                    <p className="mt-1 text-xs text-text-dim">{tenant.domain}</p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${health.tone} bg-white/5`}
                  >
                    {health.label}
                  </span>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-text-dim">
                    {tenant.plan}
                  </span>
                </div>
              </div>

              {/* Agent list */}
              <div className="mt-3 space-y-2">
                {tenantAgents.length === 0 ? (
                  <p className="text-sm text-text-dim">No agents registered</p>
                ) : (
                  tenantAgents.map((agent) => {
                    const status = activityStatus(agent.last_active);
                    return (
                      <Link
                        key={agent.id}
                        href={`/agent/${agent.id}`}
                        className="flex items-center justify-between rounded-2xl bg-bg-deep/70 px-3 py-2.5 transition hover:bg-white/5"
                      >
                        <div className="flex items-center gap-2">
                          <PulsingDot
                            status={
                              status.label === "Live"
                                ? "live"
                                : status.label === "Warm"
                                  ? "warm"
                                  : "idle"
                            }
                          />
                          <span className="text-sm font-medium text-text">{agent.name}</span>
                        </div>
                        <span className="text-xs text-text-dim">
                          {formatCompact(asNumber(agent.events_24h))} events
                        </span>
                      </Link>
                    );
                  })
                )}
              </div>

              {/* Tenant summary stats */}
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-2xl border border-border bg-bg-card px-2 py-1.5">
                  <div className="text-sm font-semibold text-cyan">
                    {tenantAgents.length}
                  </div>
                  <div className="text-[10px] text-text-dim">agents</div>
                </div>
                <div className="rounded-2xl border border-border bg-bg-card px-2 py-1.5">
                  <div className="text-sm font-semibold text-purple">
                    {formatCompact(totalEvents24h)}
                  </div>
                  <div className="text-[10px] text-text-dim">events 24h</div>
                </div>
                <div className="rounded-2xl border border-border bg-bg-card px-2 py-1.5">
                  <div className="text-sm font-semibold text-amber">
                    {formatCompact(totalTokens24h)}
                  </div>
                  <div className="text-[10px] text-text-dim">tokens 24h</div>
                </div>
              </div>

              {lastActive && (
                <p className="mt-2 text-xs text-text-dim">
                  Last active {timeAgo(lastActive)}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
