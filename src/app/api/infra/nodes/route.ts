import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  // Get all nodes with their latest metrics
  const nodesResult = await query(`
    SELECT n.*,
      m.cpu_percent, m.memory_used_mb, m.memory_total_mb,
      m.disk_used_gb, m.disk_total_gb, m.docker_running,
      m.gpu_util_percent, m.tailscale_latency_ms,
      m.services AS live_services, m.status AS live_status,
      m.time AS last_collected
    FROM infra_nodes n
    LEFT JOIN LATERAL (
      SELECT * FROM node_metrics
      WHERE node_id = n.id
      ORDER BY time DESC
      LIMIT 1
    ) m ON true
    ORDER BY
      CASE n.role
        WHEN 'primary' THEN 0
        WHEN 'failover' THEN 1
        WHEN 'dfy_client' THEN 2
        WHEN 'static' THEN 3
        WHEN 'workstation' THEN 4
        ELSE 5
      END
  `);

  // Get agents per node (by matching metadata instance or tenant)
  const agentsResult = await query(`
    SELECT a.id, a.name, a.role, a.tenant_id, a.metadata, a.updated_at,
           t.name AS tenant_name
    FROM agents a
    LEFT JOIN tenants t ON t.id = a.tenant_id
    ORDER BY a.updated_at DESC
  `);

  const nodes = nodesResult.rows.map((row: Record<string, unknown>) => {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const instance = (meta.instance || row.id) as string;

    // Match agents to nodes by tenant or metadata
    const nodeAgents = (agentsResult.rows as Array<Record<string, unknown>>).filter((a) => {
      const agentMeta = (a.metadata || {}) as Record<string, unknown>;
      const agentInstance = agentMeta.instance as string | undefined;
      if (agentInstance && (row.id as string).includes(agentInstance.split("-")[0])) return true;
      if (row.tenant_id === a.tenant_id && row.role !== "workstation" && row.role !== "static") return true;
      return false;
    });

    const lastCollected = row.last_collected as string | null;
    const isStale = lastCollected
      ? Date.now() - new Date(lastCollected).getTime() > 5 * 60 * 1000
      : true;

    return {
      id: row.id,
      name: row.name,
      ip: row.ip,
      role: row.role,
      os: row.os,
      sshUser: row.ssh_user,
      tenantId: row.tenant_id,
      metadata: meta,
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
      services: row.live_services || meta.services || [],
      agents: nodeAgents.map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        tenantId: a.tenant_id,
        tenantName: a.tenant_name,
        lastActive: a.updated_at,
      })),
      lastCollected: row.last_collected,
      createdAt: row.created_at,
    };
  });

  return NextResponse.json({ nodes, timestamp: new Date().toISOString() });
}
