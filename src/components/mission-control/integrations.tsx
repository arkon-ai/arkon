"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  RefreshCw, Plus, ExternalLink, Search, Users, MoreVertical, Plug,
} from "lucide-react";
import { Button, Card, PageHeader, StatusPill, Tabs } from "./ui-cards";
import { SkeletonCard } from "./charts";
import {
  getHeaders,
  type MCPServer,
  RegistryBrowser,
  AddServerModal,
  AgentMappingPanel,
  ConfigExportModal,
} from "./mcp";

/* ─── Types ─────────────────────────────────────────────── */
type ServerRow = MCPServer & { agent_count?: number };

type GatewayStats = {
  range: string;
  summary: {
    total_requests: number;
    prev_total_requests: number;
    success_count: number;
    error_count: number;
    avg_duration_ms: number;
    p95_duration_ms: number;
    active_servers: number;
    unique_methods: number;
  };
  by_server: Array<{ server_name: string; errors: number; requests: number; avg_ms: number }>;
};

type ServersResponse = { servers: ServerRow[]; count: number; wired_agents: number };

type DisplayStatus = "live" | "idle" | "warm";
type DisplayFilter = "all" | DisplayStatus;

/* ─── Helpers ────────────────────────────────────────────── */
function fmtRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return "just now";
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

// Repo enum (online/offline/unknown) → display enum (live/warm/idle).
// Offline = warm because the canonical brief uses "warn" for "needs attention",
// and offline servers are exactly that. unknown = idle (never checked / inactive).
function mapStatus(s: MCPServer["status"]): DisplayStatus {
  if (s === "online") return "live";
  if (s === "offline") return "warm";
  return "idle";
}

function statusLabel(s: DisplayStatus): string {
  if (s === "live") return "Live";
  if (s === "warm") return "Issue";
  return "Idle";
}

/* ─── KPI Cell ──────────────────────────────────────────────
   Inline (not a kit primitive): canonical strip has 5 cells, kit's PulseStrip
   is hard-coded md:grid-cols-4. Per operating doctrine rule 6, kit changes
   live in their own PRs — so the 5-col grid stays inline here. If a second
   5-cell strip ever ships, refactor PulseStrip with a `cols` prop then. */
function KPICell({
  label,
  value,
  sub,
  tint,
}: {
  label: string;
  value: React.ReactNode;
  sub: React.ReactNode;
  tint?: "warn" | "bad" | "ok";
}) {
  // Match dashboard PulseStrip / MetricCard value styling exactly: font-mono,
  // 28px, font-medium, leading-none, tracking-normal. Canonical KPI-value
  // recipe throughout the app — keep them visually consistent.
  // Tailwind v4 JIT does not resolve arbitrary classes that reference CSS
  // variables for font-size (e.g. arbitraries pointing to design tokens);
  // they get purged. Literal pixel values work and are the established pattern.
  const valueColor =
    tint === "warn" ? "var(--warning)" :
    tint === "bad" ? "var(--danger)" :
    tint === "ok" ? "var(--success)" :
    "var(--text-primary)";
  return (
    <div className="min-w-0 border-b border-[var(--border)] p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
      <div className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        {label}
      </div>
      <div
        className="mt-2 font-mono text-[28px] font-medium leading-none tracking-normal"
        style={{ color: valueColor }}
      >
        {value}
      </div>
      <div className="mt-2 font-mono text-[11px] text-[var(--text-secondary)]">{sub}</div>
    </div>
  );
}

/* ─── Overflow menu (⋯) — hosts de-escalated destructive actions ─── */
function OverflowMenu({
  onExport,
  onApproveToggle,
  approved,
  onRevoke,
}: {
  onExport: () => void;
  onApproveToggle: () => void;
  approved: boolean;
  onRevoke: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="rounded-[var(--radius-button)] p-1.5 text-[var(--text-tertiary)] transition hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        aria-label="More actions"
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-1 min-w-[180px] rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] py-1 shadow-[var(--shadow-md)]"
          role="menu"
        >
          <button
            onClick={() => { onExport(); setOpen(false); }}
            className="block w-full px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            role="menuitem"
          >
            Export config…
          </button>
          <button
            onClick={() => { onApproveToggle(); setOpen(false); }}
            className="block w-full px-3 py-2 text-left text-xs text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
            role="menuitem"
          >
            {approved ? "Revoke approval" : "Approve server"}
          </button>
          <div className="my-1 border-t border-[var(--border)]" />
          <button
            onClick={() => { onRevoke(); setOpen(false); }}
            className="block w-full px-3 py-2 text-left text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]"
            role="menuitem"
          >
            Remove…
          </button>
        </div>
      )}
    </div>
  );
}

/* ─── Integration Row ────────────────────────────────────── */
function IntegrationRow({
  server,
  isLast,
  onCheck,
  onUpdated,
  onAgents,
  onExport,
}: {
  server: ServerRow;
  isLast: boolean;
  onCheck: () => Promise<void>;
  onUpdated: () => void;
  onAgents: (id: number) => void;
  onExport: (id: number, name: string) => void;
}) {
  const [checking, setChecking] = useState(false);
  const display = mapStatus(server.status);
  const initial = (server.name?.[0] ?? "?").toUpperCase();

  const runCheck = async () => {
    setChecking(true);
    try { await onCheck(); } finally { setChecking(false); }
  };

  const toggleApproved = async () => {
    try {
      const res = await fetch(`/api/tools/mcp?id=${server.id}`, {
        method: "PATCH",
        headers: getHeaders(true),
        body: JSON.stringify({ approved: !server.approved }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success(server.approved ? "Approval revoked" : "Server approved");
      onUpdated();
    } catch {
      toast.error("Update failed");
    }
  };

  const removeServer = async () => {
    if (!confirm(`Remove "${server.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/tools/mcp?id=${server.id}`, {
        method: "DELETE",
        headers: getHeaders(true),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Server removed");
      onUpdated();
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div
      className="flex items-start gap-3 px-4 py-4"
      style={{ borderBottom: isLast ? "none" : "1px solid var(--border)" }}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] font-mono text-sm font-semibold text-[var(--text-secondary)]">
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-[var(--text-primary)]">{server.name}</span>
          <span className="rounded-[var(--radius-badge)] border border-[var(--border)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">
            {server.server_type}
          </span>
          <StatusPill status={display}>{statusLabel(display)}</StatusPill>
          {!server.approved && (
            <span className="rounded-[var(--radius-badge)] bg-[rgba(245,158,11,0.15)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[var(--warning)]">
              Unapproved
            </span>
          )}
        </div>
        {server.notes && (
          <div className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{server.notes}</div>
        )}
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
          <span>{server.agent_count ?? 0} agents</span>
          <span>·</span>
          <span>last check {fmtRelative(server.last_checked)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button kind="ghost" size="sm" icon={RefreshCw} onClick={() => void runCheck()} disabled={checking}>
          {checking ? "Checking…" : "Check now"}
        </Button>
        <Button kind="ghost" size="sm" icon={Users} onClick={() => onAgents(server.id)}>
          Agents
        </Button>
        <OverflowMenu
          onExport={() => onExport(server.id, server.name)}
          onApproveToggle={() => void toggleApproved()}
          approved={server.approved}
          onRevoke={() => void removeServer()}
        />
      </div>
    </div>
  );
}

/* ─── Main ────────────────────────────────────────────────── */
export function IntegrationsScreen() {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [wiredAgents, setWiredAgents] = useState(0);
  const [stats, setStats] = useState<GatewayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showRegistry, setShowRegistry] = useState(false);
  const [agentsForServer, setAgentsForServer] = useState<number | null>(null);
  const [exportFor, setExportFor] = useState<{ id: number; name: string } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DisplayFilter>("all");

  const fetchAll = useCallback(async () => {
    try {
      const [serverRes, statsRes] = await Promise.all([
        fetch("/api/tools/mcp", { headers: getHeaders() }),
        fetch("/api/mcp/gateway/stats?range=7d", { headers: getHeaders() }),
      ]);
      // Servers: tolerate 401/error shape — page renders empty list instead of crashing.
      if (serverRes.ok) {
        const serverData = await serverRes.json() as Partial<ServersResponse>;
        setServers(serverData.servers ?? []);
        setWiredAgents(serverData.wired_agents ?? 0);
      }
      // Stats: only setStats when the response carries the expected summary shape.
      // Without this guard, a 401 / error envelope ({error:"Unauthorized"}) makes
      // `stats` truthy but `stats.summary` undefined → callsDelta useMemo crashes.
      // Real-data only (Rule 12 fail-loud): missing data renders "—", not fake numbers.
      if (statsRes.ok) {
        const statsData = await statsRes.json() as Partial<GatewayStats>;
        if (statsData.summary) setStats(statsData as GatewayStats);
      }
    } catch {
      toast.error("Failed to load integrations");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // /api/tools/mcp?check=1 re-checks ALL servers (current backend behavior).
  // Per-row "Check now" therefore re-checks everything and refreshes — same effect
  // a future per-row probe would have on the cell that triggered it.
  const runCheck = useCallback(async () => {
    try {
      await fetch("/api/tools/mcp?check=1", { headers: getHeaders() });
      await fetchAll();
      toast.success("Health check complete");
    } catch {
      toast.error("Check failed");
    }
  }, [fetchAll]);

  const runCheckAll = async () => {
    toast("Running health checks…");
    await runCheck();
  };

  const counts = useMemo(() => {
    const live = servers.filter(s => mapStatus(s.status) === "live").length;
    const idle = servers.filter(s => mapStatus(s.status) === "idle").length;
    const warm = servers.filter(s => mapStatus(s.status) === "warm").length;
    return { total: servers.length, live, idle, warm };
  }, [servers]);

  const callsDelta = useMemo(() => {
    if (!stats) return null;
    const cur = stats.summary.total_requests;
    const prev = stats.summary.prev_total_requests;
    if (prev === 0) return cur > 0 ? { dir: "up" as const, pct: null } : null;
    const pct = Math.round(((cur - prev) / prev) * 100);
    return { dir: pct >= 0 ? "up" as const : "down" as const, pct: Math.abs(pct) };
  }, [stats]);

  const failureSubtext = useMemo(() => {
    if (!stats || stats.summary.error_count === 0) return "no failures";
    const errSources = (stats.by_server ?? []).filter(s => s.errors > 0);
    if (errSources.length === 1) return `all on ${errSources[0].server_name}`;
    if (errSources.length === 0) return `${stats.summary.error_count} failures`;
    return `across ${errSources.length} servers`;
  }, [stats]);

  const latestCheck = useMemo(() => {
    const times = servers
      .map(s => s.last_checked)
      .filter((t): t is string => !!t)
      .map(t => new Date(t).getTime());
    if (!times.length) return null;
    return fmtRelative(new Date(Math.max(...times)).toISOString());
  }, [servers]);

  const filtered = useMemo(() => {
    let list = servers;
    if (filter !== "all") {
      list = list.filter(s => mapStatus(s.status) === filter);
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        (s.notes?.toLowerCase().includes(q) ?? false)
      );
    }
    return list;
  }, [servers, filter, query]);

  if (loading) {
    return (
      <div className="space-y-4 pb-24">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Integrations"
        subtitle="Tools your agents can call. Every server is health-checked, scoped per agent, and revocable."
        live={true}
        updated={latestCheck ?? undefined}
        action={
          <div className="flex gap-2">
            <Button kind="ghost" size="sm" icon={RefreshCw} onClick={() => void runCheckAll()}>
              Check all
            </Button>
            <Button kind="ghost" size="sm" icon={ExternalLink} onClick={() => setShowRegistry(s => !s)}>
              Browse registry
            </Button>
            <Button kind="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>
              Add server
            </Button>
          </div>
        }
      />

      {showRegistry && (
        <Card
          title="Browse registry"
          meta="Official MCP Registry — community-verified servers"
          action={<Button kind="ghost" size="sm" onClick={() => setShowRegistry(false)}>Close</Button>}
        >
          <RegistryBrowser onImported={() => { void fetchAll(); }} />
        </Card>
      )}

      {/* 5-cell KPI grid */}
      <div className="grid overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] md:grid-cols-5">
        <KPICell
          label="Connected"
          value={counts.total}
          sub={`${counts.live} live · ${counts.idle} idle · ${counts.warm} warn`}
        />
        <KPICell
          label="Wired to agents"
          value={wiredAgents}
          sub="fleet coverage"
        />
        <KPICell
          label="Calls · 7d"
          value={stats ? fmtCount(stats.summary.total_requests) : "—"}
          sub={
            callsDelta
              ? (
                <span style={{ color: callsDelta.dir === "up" ? "var(--success)" : "var(--danger)" }}>
                  {callsDelta.dir === "up" ? "↑" : "↓"} {callsDelta.pct != null ? `${callsDelta.pct}%` : "new traffic"}
                </span>
              )
              : "no prior data"
          }
        />
        <KPICell
          label="Avg latency"
          value={stats ? `${stats.summary.avg_duration_ms}ms` : "—"}
          sub={stats ? `p95 ${stats.summary.p95_duration_ms}ms` : "—"}
        />
        <KPICell
          label="Failures · 7d"
          value={stats ? stats.summary.error_count : "—"}
          sub={failureSubtext}
          tint={stats && stats.summary.error_count > 0 ? "warn" : undefined}
        />
      </div>

      {/* Filter + tabs */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search integrations…"
            className="w-full rounded-[var(--radius-button)] border border-[var(--border)] bg-[var(--bg-surface)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] outline-none transition placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)]"
          />
        </div>
        <Tabs<DisplayFilter>
          items={[
            { id: "all", label: `All · ${counts.total}` },
            { id: "live", label: `Live · ${counts.live}` },
            { id: "idle", label: `Idle · ${counts.idle}` },
            { id: "warm", label: `Issues · ${counts.warm}` },
          ]}
          active={filter}
          onChange={(v) => setFilter(v)}
        />
      </div>

      {/* List */}
      {servers.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <Plug className="mx-auto mb-3 h-8 w-8 text-[var(--text-tertiary)]" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">No integrations yet</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Add servers manually or browse the official registry.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <Button kind="primary" size="sm" icon={Plus} onClick={() => setShowAdd(true)}>
                Add manually
              </Button>
              <Button kind="ghost" size="sm" icon={ExternalLink} onClick={() => setShowRegistry(true)}>
                Browse registry
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card flush>
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--text-secondary)]">
              No servers match this filter
            </div>
          ) : (
            filtered.map((server, i) => (
              <IntegrationRow
                key={server.id}
                server={server}
                isLast={i === filtered.length - 1}
                onCheck={runCheck}
                onUpdated={() => { void fetchAll(); }}
                onAgents={(id) => setAgentsForServer(id)}
                onExport={(id, name) => setExportFor({ id, name })}
              />
            ))
          )}
        </Card>
      )}

      {/* Footer meta */}
      <div className="flex justify-between border-t border-[var(--border)] pt-3 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
        <span>Revoke moved into the (⋯) menu · destructive, no longer the default action</span>
        <span>{filtered.length} of {servers.length}</span>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showAdd && (
          <AddServerModal
            onClose={() => setShowAdd(false)}
            onAdded={() => { void fetchAll(); setShowAdd(false); }}
          />
        )}
        {agentsForServer !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center"
            onClick={() => setAgentsForServer(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              className="w-full max-w-md rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-elevated)] p-4 shadow-[var(--shadow-lg)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Assigned agents</h3>
                <button
                  onClick={() => setAgentsForServer(null)}
                  className="text-[var(--text-tertiary)] transition hover:text-[var(--text-primary)]"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <AgentMappingPanel serverId={agentsForServer} onClose={() => setAgentsForServer(null)} />
            </motion.div>
          </motion.div>
        )}
        {exportFor && (
          <ConfigExportModal
            serverId={exportFor.id}
            serverName={exportFor.name}
            onClose={() => setExportFor(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
