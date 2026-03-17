import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

/** Generate mesh connections between all registered nodes */
function generateMeshConnections(nodes: Array<{ id: string; name: string }>): Array<{ from: string; to: string; label: string }> {
  const connections: Array<{ from: string; to: string; label: string }> = [];
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      connections.push({
        from: nodes[i].id,
        to: nodes[j].id,
        label: `${nodes[i].name} ↔ ${nodes[j].name}`,
      });
    }
  }
  return connections;
}

/** Derive positions from metadata or auto-layout in a grid */
function derivePositions(nodes: Array<{ id: string; metadata: Record<string, unknown> }>): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  nodes.forEach((node, idx) => {
    const pos = node.metadata.topology_position as { x: number; y: number } | undefined;
    if (pos) {
      positions[node.id] = pos;
    } else {
      const col = idx % 3;
      const row = Math.floor(idx / 3);
      positions[node.id] = { x: 150 + col * 250, y: 150 + row * 200 };
    }
  });
  return positions;
}

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

  const nodeRows = nodesResult.rows as Array<Record<string, unknown>>;
  const positions = derivePositions(
    nodeRows.map((r) => ({ id: r.id as string, metadata: (r.metadata || {}) as Record<string, unknown> }))
  );

  const nodes = nodeRows.map((row) => {
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
      position: positions[row.id as string] || { x: 400, y: 300 },
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

  // Build edges — generate mesh connections from registered nodes
  const CONNECTIONS = generateMeshConnections(nodes.map((n) => ({ id: n.id, name: n.name as string })));
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
    hub: { label: "Network Mesh", x: 420, y: 310 },
    timestamp: new Date().toISOString(),
  });
}
