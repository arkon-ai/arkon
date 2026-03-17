import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { broadcast } from "@/lib/event-bus";
import { timingSafeEqual } from "crypto";

export const dynamic = "force-dynamic";

/**
 * Self-report endpoint for nodes that can't be SSH'd into (e.g., Tailscale SSH-only nodes).
 * Called by a cron script on the node itself.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const validToken = process.env.MC_ADMIN_TOKEN || process.env.CRON_SECRET;

  if (!token || !validToken || Buffer.byteLength(token) !== Buffer.byteLength(validToken) || !timingSafeEqual(Buffer.from(token), Buffer.from(validToken))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { nodeId, cpu, memUsed, memTotal, diskUsed, diskTotal, dockerRunning, gpuUtil, services } = body;

  if (!nodeId) {
    return NextResponse.json({ error: "nodeId required" }, { status: 400 });
  }

  // Verify node exists
  const nodeCheck = await query("SELECT id FROM infra_nodes WHERE id = $1", [nodeId]);
  if (nodeCheck.rows.length === 0) {
    return NextResponse.json({ error: "Unknown node" }, { status: 404 });
  }

  // Determine status
  let status = "online";
  const diskPct = diskUsed && diskTotal ? (diskUsed / diskTotal) * 100 : 0;
  const memPct = memUsed && memTotal ? (memUsed / memTotal) * 100 : 0;
  if (diskPct > 85 || memPct > 90 || (cpu !== null && cpu > 90)) status = "degraded";

  const now = new Date();
  await query(
    `INSERT INTO node_metrics (time, node_id, cpu_percent, memory_used_mb, memory_total_mb,
      disk_used_gb, disk_total_gb, docker_running, gpu_util_percent, services, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
    [now, nodeId, cpu ?? null, memUsed ?? null, memTotal ?? null,
     diskUsed ?? null, diskTotal ?? null, dockerRunning ?? null, gpuUtil ?? null,
     services ? JSON.stringify(services) : '[]', status]
  );

  broadcast({
    type: "infra_report",
    payload: { nodeId, status, collectedAt: now.toISOString() },
  });

  return NextResponse.json({ ok: true, nodeId, status, time: now.toISOString() });
}
