import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await params;

  const nodeResult = await query("SELECT * FROM infra_nodes WHERE id = $1", [id]);
  if (nodeResult.rows.length === 0) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const node = nodeResult.rows[0] as Record<string, unknown>;

  // Get recent metrics (last 24h, 1 per 5 minutes)
  const metricsResult = await query(`
    SELECT time, cpu_percent, memory_used_mb, memory_total_mb,
           disk_used_gb, disk_total_gb, docker_running,
           gpu_util_percent, tailscale_latency_ms, services, status
    FROM node_metrics
    WHERE node_id = $1 AND time > NOW() - INTERVAL '24 hours'
    ORDER BY time DESC
    LIMIT 288
  `, [id]);

  // Get latest metrics
  const latest = metricsResult.rows[0] as Record<string, unknown> | undefined;

  // Get agents for this node's tenant
  const agentsResult = await query(`
    SELECT a.id, a.name, a.role, a.tenant_id, a.metadata, a.updated_at
    FROM agents a
    WHERE a.tenant_id = $1
    ORDER BY a.updated_at DESC
  `, [node.tenant_id]);

  // Get recent events from this agent
  const eventsResult = await query(`
    SELECT e.id, e.event_type, e.direction, e.channel_id, e.sender,
           e.content, e.created_at, e.threat_level
    FROM events e
    WHERE e.agent_id IN (SELECT id FROM agents WHERE tenant_id = $1)
    ORDER BY e.created_at DESC
    LIMIT 10
  `, [node.tenant_id]);

  return NextResponse.json({
    node: {
      id: node.id,
      name: node.name,
      ip: node.ip,
      role: node.role,
      os: node.os,
      sshUser: node.ssh_user,
      tenantId: node.tenant_id,
      metadata: node.metadata,
    },
    status: latest?.status || "unknown",
    metrics: {
      current: latest ? {
        cpu: latest.cpu_percent,
        memoryUsedMb: latest.memory_used_mb,
        memoryTotalMb: latest.memory_total_mb,
        diskUsedGb: latest.disk_used_gb,
        diskTotalGb: latest.disk_total_gb,
        dockerRunning: latest.docker_running,
        gpuUtil: latest.gpu_util_percent,
        latencyMs: latest.tailscale_latency_ms,
        services: latest.services,
        collectedAt: latest.time,
      } : null,
      history: metricsResult.rows.reverse().map((r: Record<string, unknown>) => ({
        time: r.time,
        cpu: r.cpu_percent,
        memory: r.memory_used_mb,
        disk: r.disk_used_gb,
        latency: r.tailscale_latency_ms,
      })),
    },
    agents: agentsResult.rows,
    recentEvents: eventsResult.rows,
    timestamp: new Date().toISOString(),
  });
}
