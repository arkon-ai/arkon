import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";
import { broadcast } from "@/lib/event-bus";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface NodeConfig {
  id: string;
  ip: string;
  sshUser: string | null;
  isLocal: boolean;
  selfReport?: boolean; // node pushes its own stats
}

const SSH_KEY = "~/.ssh/mc_cron_key";

const NODES: NodeConfig[] = [
  { id: "dell-g5-5587", ip: "100.99.150.81", sshUser: null, isLocal: false, selfReport: true },
  { id: "hetzner-eu", ip: "100.108.57.71", sshUser: null, isLocal: true },
  { id: "hetzner-na", ip: "100.66.164.114", sshUser: "root", isLocal: false },
  { id: "contabo-hofmi", ip: "100.93.154.15", sshUser: "root", isLocal: false },
  { id: "hofmi-app-1", ip: "100.105.87.117", sshUser: "root", isLocal: false },
];

async function runCmd(cmd: string, timeoutMs = 10000): Promise<string> {
  try {
    const { stdout } = await execAsync(cmd, { timeout: timeoutMs });
    return stdout.trim();
  } catch {
    return "";
  }
}

function sshCmd(node: NodeConfig, remoteCmd: string): string {
  if (node.isLocal) return remoteCmd;
  return `ssh -i ${SSH_KEY} -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes ${node.sshUser}@${node.ip} '${remoteCmd}'`;
}

async function collectNode(node: NodeConfig) {
  // Self-reporting nodes: only collect latency + service ports, stats come from /api/infra/report
  if (node.selfReport) {
    const pingStr = await runCmd(`ping -c 1 -W 3 ${node.ip} 2>/dev/null | grep time=`);
    const m = (pingStr || "").match(/time[=<]([\d.]+)/);
    const latencyMs = m ? parseFloat(m[1]) : null;

    // Read latest self-reported stats from DB
    const latest = await query(
      `SELECT cpu_percent, memory_used_mb, memory_total_mb, disk_used_gb, disk_total_gb,
              docker_running, gpu_util_percent, status
       FROM node_metrics WHERE node_id = $1
       ORDER BY time DESC LIMIT 1`,
      [node.id]
    );

    if (latest.rows.length > 0) {
      const r = latest.rows[0];
      return {
        nodeId: node.id,
        status: r.status || "online",
        cpu: r.cpu_percent,
        memUsed: r.memory_used_mb,
        memTotal: r.memory_total_mb,
        diskUsed: r.disk_used_gb,
        diskTotal: r.disk_total_gb,
        dockerRunning: r.docker_running,
        gpuUtil: r.gpu_util_percent,
        latencyMs,
      };
    }

    return {
      nodeId: node.id, status: latencyMs !== null ? "online" : "offline",
      cpu: null, memUsed: null, memTotal: null,
      diskUsed: null, diskTotal: null, dockerRunning: null,
      gpuUtil: null, latencyMs,
    };
  }

  // SSH-collected nodes: run simple commands in parallel
  const [loadavg, nprocStr, memLine, diskLine, dockerStr, gpuStr, pingStr] = await Promise.all([
    runCmd(sshCmd(node, "cat /proc/loadavg")),
    runCmd(sshCmd(node, "nproc")),
    runCmd(sshCmd(node, "free -m | grep Mem")),
    runCmd(sshCmd(node, "df -BG / | tail -1")),
    runCmd(sshCmd(node, "docker ps -q 2>/dev/null | wc -l")),
    runCmd(sshCmd(node, "nvidia-smi --query-gpu=utilization.gpu --format=csv,noheader,nounits 2>/dev/null || echo -1")),
    !node.isLocal
      ? runCmd(`ping -c 1 -W 3 ${node.ip} 2>/dev/null | grep time=`)
      : Promise.resolve("time=0"),
  ]);

  const load1m = parseFloat((loadavg || "").split(" ")[0]) || 0;
  const nproc = parseInt(nprocStr) || 1;
  const cpu = loadavg ? Math.min(Math.round((load1m / nproc) * 100), 100) : null;

  const memParts = (memLine || "").split(/\s+/);
  const memTotal = memParts.length > 1 ? parseInt(memParts[1]) || null : null;
  const memUsed = memParts.length > 2 ? parseInt(memParts[2]) || null : null;

  const diskParts = (diskLine || "").replace(/G/g, "").split(/\s+/);
  const diskTotal = diskParts.length > 1 ? parseInt(diskParts[1]) || null : null;
  const diskUsed = diskParts.length > 2 ? parseInt(diskParts[2]) || null : null;

  const dockerRunning = parseInt(dockerStr) || 0;

  const gpuVal = parseInt(gpuStr);
  const gpuUtil = !isNaN(gpuVal) && gpuVal >= 0 ? gpuVal : null;

  let latencyMs: number | null = null;
  if (node.isLocal) {
    latencyMs = 0;
  } else {
    const m = (pingStr || "").match(/time[=<]([\d.]+)/);
    latencyMs = m ? parseFloat(m[1]) : null;
  }

  let status = "online";
  if (!loadavg && !memLine) {
    status = "offline";
  } else {
    const diskPct = diskUsed && diskTotal ? (diskUsed / diskTotal) * 100 : 0;
    const memPct = memUsed && memTotal ? (memUsed / memTotal) * 100 : 0;
    if (diskPct > 85 || memPct > 90 || (cpu !== null && cpu > 90)) status = "degraded";
  }

  return { nodeId: node.id, status, cpu, memUsed, memTotal, diskUsed, diskTotal, dockerRunning, gpuUtil, latencyMs };
}

async function collectServices(node: NodeConfig): Promise<Array<{ name: string; active: boolean; port?: number }>> {
  const services: Array<{ name: string; active: boolean; port?: number }> = [];

  // Local port check — checks if any process is listening on the port (works for all bindings)
  const checkPortLocal = async (port: number): Promise<boolean> => {
    try {
      const { stdout } = await execAsync(
        `ss -tlnp 2>/dev/null | grep -q ':${port} ' && echo UP || echo DOWN`,
        { timeout: 5000 }
      );
      return stdout.trim() === "UP";
    } catch {
      return false;
    }
  };

  // SSH-based port check — for services on remote nodes (checks locally on the remote host)
  const checkPortSSH = async (n: NodeConfig, port: number): Promise<boolean> => {
    if (!n.sshUser) return false;
    const result = await runCmd(sshCmd(n, `ss -tlnp 2>/dev/null | grep -q :${port} && echo UP || echo DOWN`));
    return result.trim() === "UP";
  };

  if (node.id === "dell-g5-5587") {
    // Dell can't be SSH'd to from EU (Tailscale SSH only).
    // Read services from latest self-reported metric in DB.
    const latest = await query(
      `SELECT services FROM node_metrics WHERE node_id = $1
       AND services IS NOT NULL AND services != '[]'::jsonb
       ORDER BY time DESC LIMIT 1`,
      [node.id]
    );
    if (latest.rows.length > 0 && Array.isArray(latest.rows[0].services)) {
      return latest.rows[0].services;
    }
    // No self-reported services yet — return unknown
    services.push({ name: "OpenClaw Gateway", active: false, port: 18789 });
    services.push({ name: "Ollama", active: false, port: 11434 });
  } else if (node.id === "hetzner-eu") {
    services.push({ name: "Arkon", active: await checkPortLocal(4000), port: 4000 });
    services.push({ name: "TimescaleDB", active: await checkPortLocal(5432), port: 5432 });
    services.push({ name: "Grafana", active: await checkPortLocal(3000), port: 3000 });
    services.push({ name: "n8n", active: await checkPortLocal(5678), port: 5678 });
  } else if (node.id === "hetzner-na") {
    services.push({ name: "Nginx", active: await checkPortSSH(node, 80), port: 80 });
  } else if (node.id === "contabo-hofmi") {
    services.push({ name: "OpenClaw Gateway", active: await checkPortSSH(node, 18789), port: 18789 });
  } else if (node.id === "hofmi-app-1") {
    services.push({ name: "Coolify", active: await checkPortSSH(node, 8000), port: 8000 });
    services.push({ name: "Traefik", active: await checkPortSSH(node, 443), port: 443 });
  }

  return services;
}

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  const providedSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  const isValidCron = cronSecret && providedSecret === cronSecret;
  const isAdmin = !isValidCron && validateAdmin(req);

  if (!isValidCron && !isAdmin) return unauthorized("Cron secret or admin token required");

  const now = new Date();
  const results = await Promise.all(NODES.map(async (node) => {
    const [stats, services] = await Promise.all([
      collectNode(node),
      collectServices(node),
    ]);
    return { ...stats, services };
  }));

  // Write metrics (skip self-reporting nodes — they write their own via /api/infra/report)
  for (const r of results) {
    const node = NODES.find(n => n.id === r.nodeId);

    if (node?.selfReport) {
      // For self-reporting nodes, update services on the latest metric row
      if (r.services && r.services.length > 0) {
        await query(
          `UPDATE node_metrics SET services = $1, tailscale_latency_ms = $2
           WHERE node_id = $3 AND time = (SELECT time FROM node_metrics WHERE node_id = $3 ORDER BY time DESC LIMIT 1)`,
          [JSON.stringify(r.services), r.latencyMs, r.nodeId]
        );
      }
      continue;
    }

    await query(
      `INSERT INTO node_metrics (time, node_id, cpu_percent, memory_used_mb, memory_total_mb,
        disk_used_gb, disk_total_gb, docker_running, gpu_util_percent, tailscale_latency_ms,
        services, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        now, r.nodeId, r.cpu, r.memUsed, r.memTotal,
        r.diskUsed, r.diskTotal, r.dockerRunning, r.gpuUtil, r.latencyMs,
        JSON.stringify(r.services), r.status,
      ]
    );
  }

  broadcast({
    type: "infra_update",
    payload: { nodes: results, collectedAt: now.toISOString() },
  });

  return NextResponse.json({
    ok: true,
    collected: results.length,
    nodes: results,
    collectedAt: now.toISOString(),
  });
}
