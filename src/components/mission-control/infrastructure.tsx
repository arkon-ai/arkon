"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { SectionDescription } from "./dashboard-clarity";

// ── Types ─────────────────────────────────────────────────────────────────────
interface InfraNode {
  id: string;
  name: string;
  ip: string;
  role: string;
  os: string;
  tenantId: string;
  metadata: Record<string, unknown>;
  position: { x: number; y: number };
  status: string;
  metrics: {
    cpu: number | null;
    memoryUsedMb: number | null;
    memoryTotalMb: number | null;
    diskUsedGb: number | null;
    diskTotalGb: number | null;
    dockerRunning: number | null;
    gpuUtil: number | null;
    latencyMs: number | null;
  } | null;
  services: Array<{ name: string; active: boolean; port?: number }>;
  agents: Array<{ id: string; name: string; role: string; lastActive: string }>;
  lastCollected: string | null;
}

interface TopologyData {
  nodes: InfraNode[];
  edges: Array<{
    id: string;
    source: string;
    target: string;
    label: string;
    latencyMs: number | null;
    sourceStatus: string;
    targetStatus: string;
  }>;
  hub: { label: string; x: number; y: number };
  timestamp: string;
}

interface ActionResult {
  ok: boolean;
  action: string;
  nodeId: string;
  output: string;
  error?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

const ROLE_COLORS: Record<string, { color: string; bg: string; border: string }> = {
  primary:     { color: "#22c55e", bg: "rgba(34, 197, 94, 0.08)",  border: "rgba(34, 197, 94, 0.25)" },
  failover:    { color: "#f59e0b", bg: "rgba(245, 158, 11, 0.08)", border: "rgba(245, 158, 11, 0.25)" },
  static:      { color: "#737373", bg: "rgba(115, 115, 115, 0.08)",border: "rgba(115, 115, 115, 0.25)" },
  dfy_client:  { color: "#00E88A", bg: "rgba(167, 139, 250, 0.08)", border: "rgba(167, 139, 250, 0.25)" },
  workstation: { color: "#60a5fa", bg: "rgba(96, 165, 250, 0.08)", border: "rgba(96, 165, 250, 0.25)" },
};

const STATUS_COLORS: Record<string, string> = {
  online: "#22c55e",
  degraded: "#f59e0b",
  offline: "#ef4444",
  unknown: "#525252",
};

const ROLE_LABELS: Record<string, string> = {
  primary: "PRIMARY",
  failover: "FAILOVER",
  static: "STATIC",
  dfy_client: "DFY CLIENT",
  workstation: "WORKSTATION",
};

const ROLE_ICONS: Record<string, string> = {
  primary: "\uD83D\uDDA5",
  failover: "\u2601\uFE0F",
  static: "\uD83C\uDF10",
  dfy_client: "\uD83E\uDD1D",
  workstation: "\uD83D\uDCBB",
};

function pctBar(value: number | null, total: number | null, thresholds = { warn: 65, danger: 85 }) {
  if (value == null || total == null || total === 0) return null;
  const pct = Math.round((value / total) * 100);
  const color = pct > thresholds.danger ? "#ef4444" : pct > thresholds.warn ? "#f59e0b" : "#22c55e";
  return { pct, color };
}

// ── Custom React Flow Node ────────────────────────────────────────────────────
function InfraNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as InfraNode;
  const roleStyle = ROLE_COLORS[d.role] || ROLE_COLORS.primary;
  const statusColor = STATUS_COLORS[d.status] || STATUS_COLORS.unknown;
  const meta = d.metadata as Record<string, unknown>;
  const ramGb = meta.ram_gb as number | undefined;

  const cpuPct = d.metrics?.cpu != null ? Math.round(d.metrics.cpu) : null;
  const memBar = d.metrics?.memoryUsedMb && d.metrics?.memoryTotalMb
    ? pctBar(d.metrics.memoryUsedMb, d.metrics.memoryTotalMb)
    : ramGb ? { pct: 0, color: "#525252" } : null;
  const diskBar = d.metrics?.diskUsedGb && d.metrics?.diskTotalGb
    ? pctBar(d.metrics.diskUsedGb, d.metrics.diskTotalGb)
    : null;

  const isCompact = d.role === "static" || d.role === "workstation";

  return (
    <div
      className="group relative"
      style={{ minWidth: isCompact ? 200 : 240 }}
    >
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

      <div
        className="rounded-2xl border p-4 transition-all duration-200"
        style={{
          background: selected ? "#111111" : "#0a0a0a",
          borderColor: selected ? roleStyle.border : "#1a1a1a",
          boxShadow: selected
            ? `0 0 30px -10px ${roleStyle.color}40, 0 20px 60px -20px rgba(0,0,0,0.6)`
            : "0 4px 20px -4px rgba(0,0,0,0.4)",
        }}
      >
        {/* Top glow line */}
        <div
          className="absolute left-0 right-0 top-0 h-[1px] rounded-t-2xl opacity-0 transition-opacity group-hover:opacity-60"
          style={{ background: `linear-gradient(90deg, transparent, ${roleStyle.color}, transparent)` }}
        />

        {/* Header */}
        <div className="mb-3 flex items-start justify-between">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg text-base"
            style={{ background: roleStyle.bg, color: roleStyle.color }}
          >
            {ROLE_ICONS[d.role] || "\uD83D\uDDA5"}
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className="relative h-2 w-2 rounded-full"
              style={{ background: statusColor }}
            >
              <div
                className="absolute inset-[-3px] animate-ping rounded-full opacity-40"
                style={{ background: statusColor, animationDuration: d.status === "degraded" ? "1.2s" : "2s" }}
              />
            </div>
            <span className="text-[11px] font-medium" style={{ color: statusColor }}>
              {d.status === "unknown" ? "No data" : d.status.charAt(0).toUpperCase() + d.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Name & IP */}
        <p className="mb-0.5 text-[14px] font-semibold text-[var(--text-primary)]">{d.name}</p>
        <p className="mb-2 font-mono text-[11px] text-[var(--text-tertiary)]">{d.ip}</p>

        {/* Role badge */}
        <span
          className="mb-3 inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ background: roleStyle.bg, color: roleStyle.color, borderColor: "#1a1a1a" }}
        >
          {ROLE_LABELS[d.role] || d.role}
        </span>

        {/* Stats */}
        {d.metrics && (
          <div className={`mt-1 grid gap-2 ${isCompact ? "grid-cols-1" : "grid-cols-2"}`}>
            {cpuPct != null && (
              <StatBar label="CPU" value={cpuPct} color={cpuPct > 85 ? "#ef4444" : cpuPct > 65 ? "#f59e0b" : "#22c55e"} />
            )}
            {memBar && (
              <StatBar label="RAM" value={memBar.pct} color={memBar.color}
                suffix={d.metrics?.memoryUsedMb ? `${(d.metrics.memoryUsedMb / 1024).toFixed(1)}G` : undefined} />
            )}
            {diskBar && !isCompact && (
              <StatBar label="Disk" value={diskBar.pct} color={diskBar.color} />
            )}
            {d.metrics?.dockerRunning != null && d.metrics.dockerRunning > 0 && !isCompact && (
              <div>
                <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">Docker</p>
                <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">{d.metrics.dockerRunning} up</p>
              </div>
            )}
          </div>
        )}

        {/* Services pills */}
        {Array.isArray(d.services) && d.services.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {(d.services as Array<{ name: string; active: boolean }>).slice(0, isCompact ? 3 : 6).map((svc) => (
              <span
                key={svc.name}
                className="rounded-md border px-1.5 py-0.5 text-[10px] font-medium"
                style={{
                  background: svc.active ? "rgba(34, 197, 94, 0.06)" : "rgba(255,255,255,0.02)",
                  color: svc.active ? "#22c55e" : "#525252",
                  borderColor: svc.active ? "rgba(34, 197, 94, 0.12)" : "#1a1a1a",
                }}
              >
                {svc.name}
              </span>
            ))}
          </div>
        )}

        {/* Alert for degraded/offline */}
        {(d.status === "degraded" || d.status === "offline") && (
          <div
            className="mt-3 flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[11px]"
            style={{
              background: d.status === "offline" ? "rgba(239,68,68,0.06)" : "rgba(245,158,11,0.06)",
              borderColor: d.status === "offline" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
              color: d.status === "offline" ? "#ef4444" : "#f59e0b",
            }}
          >
            {"\u26A0"} {d.status === "offline" ? "Node unreachable" : "Performance degraded"}
          </div>
        )}
      </div>
    </div>
  );
}

function StatBar({ label, value, color, suffix }: { label: string; value: number; color: string; suffix?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">{label}</p>
      <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${value}%`, background: color }} />
      </div>
      <p className="mt-0.5 font-mono text-[11px] text-[var(--text-tertiary)]">{suffix || `${value}%`}</p>
    </div>
  );
}

// ── Detail Panel ──────────────────────────────────────────────────────────────
function DetailPanel({
  node,
  onClose,
  onAction,
}: {
  node: InfraNode | null;
  onClose: () => void;
  onAction: (nodeId: string, action: string) => void;
}) {
  const [actionResult, setActionResult] = useState<ActionResult | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  if (!node) return null;

  const roleStyle = ROLE_COLORS[node.role] || ROLE_COLORS.primary;
  const statusColor = STATUS_COLORS[node.status] || STATUS_COLORS.unknown;
  const meta = node.metadata as Record<string, unknown>;

  const actions = [
    { id: "health_check", label: "Health Check", icon: "\uD83D\uDC93", style: "primary" },
    { id: "view_logs", label: "View Logs", icon: "\uD83D\uDCC4", style: "" },
    ...(node.role !== "static" && node.role !== "workstation"
      ? [{ id: "restart_gateway", label: "Restart Gateway", icon: "\uD83D\uDD04", style: "danger" }]
      : []),
    ...(node.role === "failover"
      ? [{ id: "docker_status", label: "Docker Status", icon: "\uD83D\uDC33", style: "" }]
      : []),
    ...(node.role === "static"
      ? [{ id: "nginx_status", label: "Nginx Status", icon: "\uD83C\uDF10", style: "" }]
      : []),
    { id: "force_sync", label: "Force Sync", icon: "\uD83D\uDD04", style: "" },
  ];

  const handleAction = async (actionId: string) => {
    setLoading(actionId);
    setActionResult(null);
    onAction(node.id, actionId);

    try {
      const res = await fetch(`/api/infra/nodes/${node.id}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action: actionId }),
      });
      const data = await res.json() as ActionResult;
      setActionResult(data);
      if (data.ok) {
        toast.success(`${actionId.replace(/_/g, " ")} completed`);
      } else {
        toast.error(data.error || "Action failed");
      }
    } catch {
      toast.error("Failed to execute action");
    } finally {
      setLoading(null);
    }
  };

  return (
    <motion.div
      initial={{ x: 400, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 400, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="absolute right-0 top-0 z-50 h-full w-[380px] overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-primary)]"
    >
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--bg-primary)] px-5 py-5">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] text-xs text-[var(--text-tertiary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          {"\u2715"}
        </button>
        <p className="text-lg font-semibold text-white">{node.name}</p>
        <div className="mt-1 flex items-center gap-2 text-xs">
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: statusColor }} />
            <span style={{ color: statusColor }}>
              {node.status.charAt(0).toUpperCase() + node.status.slice(1)}
            </span>
          </span>
          <span className="text-[var(--text-tertiary)]">{"\u00B7"}</span>
          <span style={{ color: roleStyle.color }}>{ROLE_LABELS[node.role]}</span>
          <span className="text-[var(--text-tertiary)]">{"\u00B7"}</span>
          <span className="font-mono text-[var(--text-tertiary)]">{node.ip}</span>
        </div>
      </div>

      {/* Resources */}
      {node.metrics && (
        <Section title="System Resources">
          {node.metrics.cpu != null && (
            <ResourceRow label="CPU" value={node.metrics.cpu} total={100} display={`${Math.round(node.metrics.cpu)}%`} />
          )}
          {node.metrics.memoryUsedMb != null && node.metrics.memoryTotalMb != null && (
            <ResourceRow
              label="RAM"
              value={node.metrics.memoryUsedMb}
              total={node.metrics.memoryTotalMb}
              display={`${(node.metrics.memoryUsedMb / 1024).toFixed(1)} / ${(node.metrics.memoryTotalMb / 1024).toFixed(0)} GB`}
            />
          )}
          {node.metrics.diskUsedGb != null && node.metrics.diskTotalGb != null && (
            <ResourceRow
              label="Disk"
              value={node.metrics.diskUsedGb}
              total={node.metrics.diskTotalGb}
              display={`${node.metrics.diskUsedGb} / ${node.metrics.diskTotalGb} GB`}
            />
          )}
          {node.metrics.gpuUtil != null && (
            <ResourceRow label="GPU" value={node.metrics.gpuUtil} total={100} display={`${Math.round(node.metrics.gpuUtil)}%`} />
          )}
          {node.metrics.latencyMs != null && (
            <div className="flex items-center justify-between py-1.5">
              <span className="text-xs font-medium text-[var(--text-tertiary)]">Latency</span>
              <span className="font-mono text-xs text-[var(--text-secondary)]">{node.metrics.latencyMs.toFixed(1)} ms</span>
            </div>
          )}
        </Section>
      )}

      {/* Agents */}
      <Section title="Agents">
        {node.agents.length === 0 ? (
          <p className="text-xs text-[var(--text-tertiary)]">No agents on this node</p>
        ) : (
          node.agents.map((agent) => (
            <div key={agent.id} className="mb-2 flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2.5">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(34,197,94,0.08)] text-xs font-semibold text-[var(--success)]">
                  {agent.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-[var(--text-primary)]">{agent.name}</p>
                  <p className="font-mono text-[10px] text-[var(--text-tertiary)]">{agent.role}</p>
                </div>
              </div>
              <span className="rounded-full bg-[rgba(34,197,94,0.06)] px-2.5 py-0.5 text-[10px] font-semibold text-[var(--success)]">
                {agent.role}
              </span>
            </div>
          ))
        )}
      </Section>

      {/* Services */}
      {Array.isArray(node.services) && node.services.length > 0 && (
        <Section title="Services">
          <div className="grid grid-cols-2 gap-2">
            {(node.services as Array<{ name: string; active: boolean }>).map((svc) => (
              <div key={svc.name} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2">
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: svc.active ? "#22c55e" : "#525252" }} />
                <span className="text-[11px] font-medium text-[var(--text-secondary)]">{svc.name}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Actions */}
      <Section title="Quick Actions">
        <div className="grid grid-cols-2 gap-2">
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleAction(action.id)}
              disabled={loading !== null}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-medium transition
                ${action.style === "primary"
                  ? "border-[rgba(34,197,94,0.15)] bg-[rgba(34,197,94,0.05)] text-[var(--success)] hover:bg-[rgba(34,197,94,0.1)]"
                  : action.style === "danger"
                    ? "border-[rgba(239,68,68,0.12)] text-[var(--danger)] hover:bg-[rgba(239,68,68,0.05)]"
                    : "border-[var(--border)] text-[var(--text-tertiary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                }
                disabled:opacity-40`}
            >
              {loading === action.id ? (
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <span>{action.icon}</span>
              )}
              {action.label}
            </button>
          ))}
        </div>
      </Section>

      {/* Action Output */}
      {actionResult && (
        <Section title="Output">
          <pre className="max-h-60 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]">
            {actionResult.output || actionResult.error || "No output"}
          </pre>
        </Section>
      )}

      {/* Node metadata */}
      <Section title="Info">
        <div className="space-y-1.5 text-xs">
          <InfoRow label="OS" value={node.os} />
          <InfoRow label="Tenant" value={node.tenantId} />
          {typeof meta.gpu === "string" && <InfoRow label="GPU" value={meta.gpu} />}
          {typeof meta.cpu === "string" && <InfoRow label="CPU" value={meta.cpu} />}
          {node.lastCollected && (
            <InfoRow label="Last Sync" value={new Date(node.lastCollected).toLocaleString()} />
          )}
        </div>
      </Section>
    </motion.div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-[var(--border)] px-5 py-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--text-tertiary)]">{title}</p>
      {children}
    </div>
  );
}

function ResourceRow({ label, value, total, display }: { label: string; value: number; total: number; display: string }) {
  const pct = Math.round((value / total) * 100);
  const color = pct > 85 ? "#ef4444" : pct > 65 ? "#f59e0b" : "#22c55e";
  return (
    <div className="mb-2.5 flex items-center gap-3">
      <span className="w-9 text-xs font-medium text-[var(--text-tertiary)]">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="w-20 text-right font-mono text-[11px] text-[var(--text-tertiary)]">{display}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[var(--text-tertiary)]">{label}</span>
      <span className="font-mono text-[var(--text-secondary)]">{value}</span>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const nodeTypes = { infraNode: InfraNodeComponent as any };

export function InfrastructureTopology() {
  const [topology, setTopology] = useState<TopologyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<InfraNode | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[]);

  const fetchTopology = useCallback(async () => {
    try {
      const res = await fetch("/api/infra/topology", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as TopologyData;
      setTopology(data);
      setLastRefresh(new Date());
      setError(null);

      // Convert to React Flow nodes
      const flowNodes: Node[] = data.nodes
        .filter((n) => filter === "all" || n.status === filter || (filter === "unknown" && n.status === "unknown"))
        .map((n) => ({
          id: n.id,
          type: "infraNode",
          position: n.position,
          data: n as unknown as Record<string, unknown>,
          selected: selectedNode?.id === n.id,
        }));

      const flowEdges: Edge[] = data.edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: "default",
        animated: true,
        style: {
          stroke: "rgba(34, 197, 94, 0.12)",
          strokeWidth: 1.5,
          strokeDasharray: "6 4",
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: "rgba(34, 197, 94, 0.18)", width: 12, height: 12 },
        label: e.latencyMs != null ? `${e.latencyMs.toFixed(0)}ms` : undefined,
        labelStyle: { fill: "#525252", fontSize: 10, fontFamily: "monospace" },
        labelBgStyle: { fill: "#0a0a0a", fillOpacity: 0.95 },
        labelBgPadding: [4, 2] as [number, number],
        labelBgBorderRadius: 4,
      }));

      setNodes(flowNodes);
      setEdges(flowEdges);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load topology");
    } finally {
      setLoading(false);
    }
  }, [filter, selectedNode?.id, setNodes, setEdges]);

  useEffect(() => {
    fetchTopology();
    const interval = setInterval(fetchTopology, 60000);
    return () => clearInterval(interval);
  }, [fetchTopology]);

  const handleRefresh = async () => {
    setRefreshing(true);
    toast.info("Refreshing infrastructure data...");

    // Trigger a collection first
    try {
      await fetch("/api/infra/collect", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
    } catch {
      // Collection may fail, still refresh topology
    }

    await fetchTopology();
    setRefreshing(false);
    toast.success("Infrastructure data refreshed");
  };

  const handleNodeClick = useCallback((_: unknown, node: Node) => {
    const infraNode = topology?.nodes.find((n) => n.id === node.id);
    if (infraNode) {
      setSelectedNode((prev) => (prev?.id === infraNode.id ? null : infraNode));
    }
  }, [topology]);

  const handleAction = useCallback((nodeId: string, action: string) => {
    toast.info(`Running ${action.replace(/_/g, " ")} on ${nodeId}...`);
  }, []);

  const timeSince = useMemo(() => {
    const secs = Math.floor((Date.now() - lastRefresh.getTime()) / 1000);
    if (secs < 60) return `${secs}s ago`;
    return `${Math.floor(secs / 60)}m ago`;
  }, [lastRefresh]);

  // Update time display
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-[var(--success)] border-t-transparent" />
          <p className="text-sm text-[var(--text-tertiary)]">Loading infrastructure topology...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="text-center">
          <p className="mb-2 text-lg text-red-400">{"\u26A0"} Failed to load topology</p>
          <p className="mb-4 text-sm text-[var(--text-tertiary)]">{error}</p>
          <button onClick={fetchTopology} className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]">
            Retry
          </button>
        </div>
      </div>
    );
  }

  const onlineCount = topology?.nodes.filter((n) => n.status === "online").length || 0;
  const degradedCount = topology?.nodes.filter((n) => n.status === "degraded").length || 0;
  const totalCount = topology?.nodes.length || 0;

  return (
    <div>
      <SectionDescription id="infrastructure">
        Monitor CPU, memory, disk, and service health across all your servers. Add nodes via
        the Admin Panel &mdash; the collector checks each server every minute and reports status here.
      </SectionDescription>

      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Infrastructure</h1>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">
            {onlineCount}/{totalCount} nodes online
            {degradedCount > 0 && <span className="text-[var(--warning)]"> {"\u00B7"} {degradedCount} degraded</span>}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Filter chips */}
          <div className="flex gap-1.5">
            {["all", "online", "degraded", "unknown"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition
                  ${filter === f
                    ? "bg-[rgba(34,197,94,0.08)] text-[var(--success)] ring-1 ring-[rgba(34,197,94,0.2)]"
                    : "text-[var(--text-tertiary)] hover:bg-white/5 hover:text-[var(--text-secondary)]"
                  }`}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          <span className="font-mono text-[11px] text-[var(--text-tertiary)]">Updated {timeSince}</span>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] text-[var(--text-tertiary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-40"
          >
            <svg className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M21 2v6h-6" /><path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Topology Canvas */}
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]" style={{ height: "calc(100vh - 200px)" }}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.3}
          maxZoom={1.5}
          defaultEdgeOptions={{ animated: true }}
          style={{ background: "transparent" }}
        >
          <Background color="rgba(34, 197, 94, 0.06)" gap={24} size={1} />
          <MiniMap
            nodeColor={(node) => {
              const d = node.data as unknown as InfraNode;
              return STATUS_COLORS[d?.status] || "#1a1a1a";
            }}
            maskColor="rgba(5, 5, 5, 0.85)"
            style={{
              background: "#0a0a0a",
              border: "1px solid #1a1a1a",
              borderRadius: 12,
            }}
            pannable
            zoomable
          />
        </ReactFlow>

        {/* Detail Panel */}
        <AnimatePresence>
          {selectedNode && (
            <DetailPanel
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onAction={handleAction}
            />
          )}
        </AnimatePresence>

        {/* Legend */}
        <div className="absolute bottom-4 left-4 flex gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2.5">
          {Object.entries(STATUS_COLORS).filter(([k]) => k !== "unknown").map(([status, color]) => (
            <div key={status} className="flex items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
              <div className="h-2 w-2 rounded-full" style={{ background: color }} />
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
