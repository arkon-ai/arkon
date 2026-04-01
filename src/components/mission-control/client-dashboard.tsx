"use client";

import { useEffect, useState } from "react";
import { Bot, Server, Radio, Users } from "lucide-react";
import { StatCard as UiStatCard, EmptyCard } from "./ui-cards";

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  last_seen_at: string | null;
  created_at: string;
}

interface RecentEvent {
  id: number;
  event_type: string;
  summary: string;
  created_at: string;
  agent_name: string;
}

interface InfraNode {
  hostname: string;
  status: string;
  last_seen_at: string | null;
  os: string;
  ip_address: string;
}

interface DashboardData {
  tenant: { id: string; name: string; domain: string; plan: string; created_at: string };
  agents: Agent[];
  costs: {
    last_24h: { cost_usd: number; tokens: number };
    last_30d: { cost_usd: number; tokens: number };
  };
  recent_events: RecentEvent[];
  active_sessions: number;
  infra_nodes: InfraNode[];
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function StatusDot({ status }: { status: string }) {
  const color = status === "active" || status === "online"
    ? "bg-emerald-400"
    : status === "idle"
    ? "bg-amber-400"
    : "bg-[var(--text-tertiary)]";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export function ClientDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const res = await fetch("/api/client/dashboard", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as DashboardData;
        if (mounted) { setData(d); setLoading(false); }
      } catch (err) {
        if (mounted) { setError(err instanceof Error ? err.message : "Failed to load"); setLoading(false); }
      }
    };

    load();
    const timer = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center text-[var(--text-tertiary)]">
          <div className="mb-3 text-4xl animate-pulse">MC</div>
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center">
        <p className="text-red-400">{error || "Unable to load dashboard"}</p>
      </div>
    );
  }

  const onlineAgents = data.agents.filter((a) => {
    if (!a.last_seen_at) return false;
    return Date.now() - new Date(a.last_seen_at).getTime() < 5 * 60 * 1000;
  });

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <div className="rounded-[16px] border border-[var(--border)] bg-[linear-gradient(135deg,rgba(0,212,126,0.04),rgba(0,212,126,0.04))] p-6">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Welcome back, {data.tenant.name}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {data.tenant.plan === "dfy" ? "Done-For-You" : data.tenant.plan === "owner" ? "Owner" : "Starter"} Plan
          {data.tenant.domain ? ` \u00B7 ${data.tenant.domain}` : ""}
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <UiStatCard label="Agents" value={data.agents.length} subtitle={`${onlineAgents.length} online`} icon={Bot} />
        <UiStatCard label="Active Sessions" value={data.active_sessions} icon={Users} />
        <UiStatCard label="Cost (24h)" value={`$${data.costs.last_24h.cost_usd.toFixed(4)}`} subtitle={`${data.costs.last_24h.tokens.toLocaleString()} tokens`} />
        <UiStatCard label="Cost (30d)" value={`$${data.costs.last_30d.cost_usd.toFixed(4)}`} subtitle={`${data.costs.last_30d.tokens.toLocaleString()} tokens`} />
      </div>

      {/* Agents & Infra */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Agents */}
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-[var(--text-secondary)]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">My Agents</h2>
          </div>
          {data.agents.length === 0 ? (
            <EmptyCard icon={Bot} title="No agents yet" description="Agents will appear here once provisioned for your account." />
          ) : (
            <div className="space-y-3">
              {data.agents.map((agent) => (
                <div key={agent.id} className="flex items-center gap-3 rounded-xl bg-[var(--bg-primary)] px-4 py-3">
                  <StatusDot status={onlineAgents.some((a) => a.id === agent.id) ? "active" : "offline"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{agent.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{agent.role} &middot; Last seen {timeAgo(agent.last_seen_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Infrastructure */}
        <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Server className="h-4 w-4 text-[var(--text-secondary)]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Infrastructure</h2>
          </div>
          {data.infra_nodes.length === 0 ? (
            <EmptyCard icon={Server} title="No infrastructure nodes" description="Infrastructure nodes will appear here once connected." />
          ) : (
            <div className="space-y-3">
              {data.infra_nodes.map((node) => (
                <div key={node.hostname} className="flex items-center gap-3 rounded-xl bg-[var(--bg-primary)] px-4 py-3">
                  <StatusDot status={node.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-white">{node.hostname}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{node.os} &middot; {node.ip_address} &middot; {timeAgo(node.last_seen_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-5">
        <div className="mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4 text-[var(--text-secondary)]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Recent Activity</h2>
        </div>
        {data.recent_events.length === 0 ? (
          <EmptyCard icon={Radio} title="No recent activity" description="Events from your agents will appear here in real-time." />
        ) : (
          <div className="space-y-2">
            {data.recent_events.slice(0, 10).map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-xl px-3 py-2 hover:bg-white/5 transition">
                <span className="mt-0.5 text-xs text-[var(--text-tertiary)] whitespace-nowrap">{timeAgo(event.created_at)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">
                    <span className="font-medium text-white">{event.agent_name}</span>
                    {" \u00B7 "}
                    <span className="text-[var(--text-secondary)]">{event.event_type}</span>
                  </p>
                  {event.summary ? <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{event.summary}</p> : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

