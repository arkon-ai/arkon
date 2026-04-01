"use client";

import { useEffect, useState } from "react";
import { SectionDescription } from "./dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

interface GatewayStats {
  range: string;
  summary: {
    total_requests: number;
    success_count: number;
    error_count: number;
    avg_duration_ms: number;
    total_bytes: number;
    active_servers: number;
    unique_methods: number;
  };
  by_server: Array<{ server_name: string; server_id: number; requests: string; successes: string; errors: string; avg_ms: number }>;
  by_method: Array<{ mcp_method: string; count: string; avg_ms: number }>;
  recent_errors: Array<{ server_name: string; mcp_method: string; status: number; error: string; duration_ms: number; created_at: string }>;
  hourly_trend: Array<{ hour: string; requests: string; errors: string }>;
}

interface GatewayConfig {
  format: string;
  gateway: string;
  servers_count: number;
  config: { mcpServers: Record<string, unknown> };
  instructions: string;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

const ranges = [
  { value: "1h", label: "1 Hour" },
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

export function McpGateway() {
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [config, setConfig] = useState<GatewayConfig | null>(null);
  const [range, setRange] = useState("24h");
  const [loading, setLoading] = useState(true);
  const [showConfig, setShowConfig] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const load = async () => {
      try {
        const res = await fetch(`/api/mcp/gateway/stats?range=${range}`, { headers: getAuthHeaders(), cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = (await res.json()) as GatewayStats;
        if (mounted) { setStats(d); setLoading(false); }
      } catch {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [range]);

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/mcp/gateway/config?format=claude-code", { headers: getAuthHeaders(), cache: "no-store" });
      if (!res.ok) return;
      const d = (await res.json()) as GatewayConfig;
      setConfig(d);
      setShowConfig(true);
    } catch { /* silent */ }
  };

  const copyConfig = () => {
    if (config) {
      navigator.clipboard.writeText(JSON.stringify(config.config, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const s = stats?.summary;

  return (
    <div className="space-y-6">
      <SectionDescription id="mcp-gateway">
        The MCP Gateway proxies and secures your agents&apos; access to external tools via the Model Context Protocol. Register MCP servers, control which agents can use which tools, and monitor usage, latency, and errors.
      </SectionDescription>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">MCP Gateway</h1>
          <p className="text-sm text-[var(--text-tertiary)]">Proxy traffic between AI clients and MCP servers</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadConfig}
            className="rounded-lg bg-purple-500/20 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/30 transition"
          >
            Export Config
          </button>
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
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total Requests" value={s?.total_requests ?? 0} accent="cyan" />
        <StatCard label="Success" value={s?.success_count ?? 0} accent="emerald" />
        <StatCard label="Errors" value={s?.error_count ?? 0} accent="red" />
        <StatCard label="Avg Latency" value={`${s?.avg_duration_ms ?? 0}ms`} accent="amber" />
        <StatCard label="Total Data" value={formatBytes(s?.total_bytes ?? 0)} accent="purple" />
        <StatCard label="Active Servers" value={s?.active_servers ?? 0} accent="cyan" />
        <StatCard label="MCP Methods" value={s?.unique_methods ?? 0} accent="slate" />
      </div>

      {/* By server */}
      {stats && stats.by_server.length > 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Traffic by Server</h2>
          <div className="space-y-2">
            {stats.by_server.map((s) => (
              <div key={s.server_id} className="flex items-center justify-between rounded-xl bg-[var(--bg-primary)] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-white">{s.server_name || `Server #${s.server_id}`}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{s.avg_ms}ms avg &middot; {parseInt(s.errors)} errors</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-cyan-400">{parseInt(s.requests).toLocaleString()}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">requests</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* By method */}
      {stats && stats.by_method.length > 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">MCP Methods</h2>
          <div className="flex flex-wrap gap-2">
            {stats.by_method.map((m) => (
              <div key={m.mcp_method} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
                <p className="text-xs font-mono text-purple-400">{m.mcp_method}</p>
                <p className="text-xs text-[var(--text-tertiary)]">{parseInt(m.count)} calls &middot; {m.avg_ms}ms</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent errors */}
      {stats && stats.recent_errors.length > 0 ? (
        <div className="relative card-hover rounded-2xl border border-red-500/20 bg-[var(--bg-primary)] p-5">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-red-400">Recent Errors</h2>
          <div className="space-y-2">
            {stats.recent_errors.map((e, i) => (
              <div key={i} className="rounded-xl bg-red-500/5 border border-red-500/10 px-4 py-3">
                <div className="flex justify-between">
                  <p className="text-sm text-white">{e.server_name} &middot; <span className="text-red-400">{e.status}</span></p>
                  <p className="text-xs text-[var(--text-tertiary)]">{new Date(e.created_at).toLocaleString()}</p>
                </div>
                {e.error ? <p className="mt-1 text-xs text-red-300/70 truncate">{e.error}</p> : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Empty state */}
      {!loading && stats && stats.summary.total_requests === 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-8 text-center">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-4xl mb-3">{"🔌"}</p>
          <p className="text-white font-semibold">No proxy traffic yet</p>
          <p className="mt-2 text-sm text-[var(--text-tertiary)]">Enable gateway mode on MCP servers, then configure AI clients to route through the proxy.</p>
          <button
            onClick={loadConfig}
            className="mt-4 rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 transition"
          >
            Generate Client Config
          </button>
        </div>
      ) : null}

      {/* Config modal */}
      {showConfig && config ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-xl rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Gateway Config</h3>
              <button onClick={() => setShowConfig(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] text-xl">&times;</button>
            </div>
            <p className="text-sm text-[var(--text-secondary)] mb-3">{config.instructions}</p>
            <p className="text-xs text-[var(--text-tertiary)] mb-2">{config.servers_count} server(s) via {config.gateway}</p>
            <pre className="rounded-xl bg-[var(--bg-primary)] border border-[var(--border)] p-4 text-xs text-[var(--text-primary)] overflow-auto max-h-64 font-mono">
              {JSON.stringify(config.config, null, 2)}
            </pre>
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={copyConfig}
                className="rounded-lg bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-400 hover:bg-cyan-500/30 transition"
              >
                {copied ? "Copied!" : "Copy to Clipboard"}
              </button>
              <button
                onClick={() => setShowConfig(false)}
                className="rounded-lg bg-white/5 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-400", emerald: "text-emerald-400", amber: "text-amber-400",
    purple: "text-purple-400", red: "text-red-400", slate: "text-[var(--text-secondary)]",
  };
  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 text-lg font-bold ${colors[accent] || colors.cyan}`}>{typeof value === "number" ? value.toLocaleString() : value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
