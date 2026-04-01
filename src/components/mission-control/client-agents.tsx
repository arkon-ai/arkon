"use client";

import { useEffect, useState } from "react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

interface AgentWithStats {
  id: string;
  name: string;
  role: string;
  status: string;
  last_seen_at: string | null;
  created_at: string;
  cost_30d: number;
  tokens_30d: number;
  messages_30d: number;
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

function StatusBadge({ lastSeen }: { lastSeen: string | null }) {
  if (!lastSeen) return <span className="rounded-full bg-[var(--bg-surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">NEVER SEEN</span>;
  const online = Date.now() - new Date(lastSeen).getTime() < 5 * 60 * 1000;
  return online
    ? <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-400">ONLINE</span>
    : <span className="rounded-full bg-[var(--bg-surface-2)]/50 px-2 py-0.5 text-[10px] font-bold text-[var(--text-secondary)]">OFFLINE</span>;
}

export function ClientAgents() {
  const [agents, setAgents] = useState<AgentWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/client/agents", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as { agents: AgentWithStats[] };
        if (mounted) { setAgents(d.agents); setLoading(false); }
      } catch (err) {
        if (mounted) { setError(err instanceof Error ? err.message : "Failed to load"); setLoading(false); }
      }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  if (loading) return <div className="text-center text-[var(--text-tertiary)] py-20"><p className="animate-pulse">Loading agents...</p></div>;
  if (error) return <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-center"><p className="text-red-400">{error}</p></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-white">My Agents</h1>
        <span className="rounded-full bg-[var(--bg-surface-2)] px-3 py-1 text-xs text-[var(--text-secondary)]">{agents.length} total</span>
      </div>

      {agents.length === 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-8 text-center">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[var(--text-tertiary)]">No agents provisioned for your account yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {agents.map((agent) => (
            <div key={agent.id} className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5 transition hover:border-[var(--border-strong)]">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-semibold text-white">{agent.name}</h3>
                    <StatusBadge lastSeen={agent.last_seen_at} />
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                    {agent.role} &middot; ID: {agent.id} &middot; Last seen {timeAgo(agent.last_seen_at)}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-4">
                <div className="rounded-xl bg-[var(--bg-primary)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Messages (30d)</p>
                  <p className="text-sm font-bold text-cyan-400">{Number(agent.messages_30d).toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-[var(--bg-primary)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Tokens (30d)</p>
                  <p className="text-sm font-bold text-amber-400">{Number(agent.tokens_30d).toLocaleString()}</p>
                </div>
                <div className="rounded-xl bg-[var(--bg-primary)] px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase text-[var(--text-tertiary)]">Cost (30d)</p>
                  <p className="text-sm font-bold text-purple-400">${Number(agent.cost_30d).toFixed(4)}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
