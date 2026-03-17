import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

// Tailscale mesh connections between nodes
const CONNECTIONS = [
  { from: "dell-g5-5587", to: "hetzner-eu", label: "Primary ↔ Failover" },
  { from: "dell-g5-5587", to: "hetzner-na", label: "Primary ↔ Static" },
  { from: "dell-g5-5587", to: "contabo-hofmi", label: "Primary ↔ DFY" },
  { from: "dell-g5-5587", to: "brynns-laptop", label: "Primary ↔ Workstation" },
  { from: "hetzner-eu", to: "hetzner-na", label: "EU ↔ NA" },
  { from: "hetzner-eu", to: "contabo-hofmi", label: "EU ↔ DFY" },
  { from: "brynns-laptop", to: "hetzner-eu", label: "Workstation ↔ EU" },
];

// Node positions for the topology layout
const POSITIONS: Record<string, { x: number; y: number }> = {
  "dell-g5-5587": { x: 200, y: 280 },
  "hetzner-eu":   { x: 600, y: 180 },
  "hetzner-na":   { x: 100, y: 520 },
  "contabo-hofmi":{ x: 650, y: 500 },
  "brynns-laptop":{ x: 380, y: 60 },
};

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  // Get all nodes with latest metrics
  const nodesResult = await query(`
    SELECT n.id, n.name, n.ip, n.role, n.os, n.ssh_user, n.tenant_id, n.metadata,
      m.cpu_percent, m.memory_used_mb, m.memory_total_mb,
      m.disk_used_gb, m.disk_total_gb, m.docker_running,
      m.gpu_util_percent, m.tailscale_latency_ms,
      m.services AS live_services, m.status AS live_status,
      m.time AS last_collected
    FROM infra_nodes n
    LEFT JOIN LATERAL (
      SELECT * FROM node_metrics WHERE node_id = n.id ORDER BY time DESC LIMIT 1
    ) m ON true
    ORDER BY n.id
  `);

  // Get agents
  const agentsResult = await query(`
    SELECT a.id, a.name, a.role, a.tenant_id, a.metadata, a.updated_at
    FROM agents a
    ORDER BY a.updated_at DESC
  `);

  const agents = agentsResult.rows as Array<Record<string, unknown>>;

  const nodes = nodesResult.rows.map((row: Record<string, unknown>) => {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const lastCollected = row.last_collected as string | null;
    const isStale = lastCollected
      ? Date.now() - new Date(lastCollected).getTime() > 5 * 60 * 1000
      : true;

    const nodeAgents = agents.filter((a) => {
      if (row.role === "workstation" || row.role === "static") return false;
      return a.tenant_id === row.tenant_id;
    });

    return {
      id: row.id as string,
      name: row.name,
      ip: row.ip,
      role: row.role,
      os: row.os,
      tenantId: row.tenant_id,
      metadata: meta,
      position: POSITIONS[row.id as string] || { x: 400, y: 300 },
      status: isStale ? "unknown" : (row.live_status || "unknown"),
      metrics: row.last_collected ? {
        cpu: row.cpu_percent,
        memoryUsedMb: row.memory_used_mb,
        memoryTotalMb: row.memory_total_mb,
        diskUsedGb: row.disk_used_gb,
        diskTotalGb: row.disk_total_gb,
        dockerRunning: row.docker_running,
        gpuUtil: row.gpu_util_percent,
        latencyMs: row.tailscale_latency_ms,
      } : null,
      services: row.live_services || [],
      agents: nodeAgents.map((a) => ({
        id: a.id, name: a.name, role: a.role, lastActive: a.updated_at,
      })),
      lastCollected,
    };
  });

  // Build edges with latency from metrics
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const edges = CONNECTIONS.map((conn) => {
    const fromNode = nodeMap.get(conn.from);
    const toNode = nodeMap.get(conn.to);
    return {
      id: `${conn.from}-${conn.to}`,
      source: conn.from,
      target: conn.to,
      label: conn.label,
      latencyMs: toNode?.metrics?.latencyMs ?? null,
      sourceStatus: fromNode?.status || "unknown",
      targetStatus: toNode?.status || "unknown",
    };
  });

  return NextResponse.json({
    nodes,
    edges,
    hub: { label: "Tailscale Mesh", x: 420, y: 310 },
    timestamp: new Date().toISOString(),
  });
}
