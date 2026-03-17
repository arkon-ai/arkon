import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { query } from "@/lib/db";
import { unauthorized, validateAdmin } from "@/app/api/tools/_utils";
import { broadcast } from "@/lib/event-bus";

const execAsync = promisify(exec);

export const dynamic = "force-dynamic";

type ActionType = "health_check" | "restart_gateway" | "view_logs" | "docker_status" | "nginx_status" | "force_sync";

const ALLOWED_ACTIONS: ActionType[] = [
  "health_check", "restart_gateway", "view_logs",
  "docker_status", "nginx_status", "force_sync",
];

async function sshRun(sshUser: string, ip: string, command: string, timeoutMs = 15000): Promise<{ stdout: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(
      `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${sshUser}@${ip} '${command}'`,
      { timeout: timeoutMs }
    );
    return { stdout: stdout.trim(), error: stderr.trim() || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", error: message };
  }
}

async function localRun(command: string, timeoutMs = 15000): Promise<{ stdout: string; error?: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, { timeout: timeoutMs });
    return { stdout: stdout.trim(), error: stderr.trim() || undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { stdout: "", error: message };
  }
}

async function runOnNode(sshUser: string | null, ip: string, command: string, isLocal: boolean) {
  if (isLocal) {
    return localRun(command);
  }
  if (!sshUser) {
    return { stdout: "", error: "No SSH user configured for this node" };
  }
  return sshRun(sshUser, ip, command);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  const { id } = await params;
  const body = await req.json() as { action: string };

  if (!body.action || !ALLOWED_ACTIONS.includes(body.action as ActionType)) {
    return NextResponse.json(
      { error: `Invalid action. Allowed: ${ALLOWED_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const nodeResult = await query("SELECT * FROM infra_nodes WHERE id = $1", [id]);
  if (nodeResult.rows.length === 0) {
    return NextResponse.json({ error: "Node not found" }, { status: 404 });
  }

  const node = nodeResult.rows[0] as Record<string, unknown>;
  const sshUser = node.ssh_user as string | null;
  const ip = node.ip as string;
  const meta = (node.metadata ?? {}) as Record<string, unknown>;
  const isLocal = meta.is_local === true;
  const ocUser = (meta.openclaw_user as string) ?? sshUser ?? "root";
  const action = body.action as ActionType;

  let result: { stdout: string; error?: string };

  switch (action) {
    case "health_check":
      result = await runOnNode(sshUser, ip,
        "echo UPTIME:$(uptime -p) && echo LOAD:$(cat /proc/loadavg) && echo MEM:$(free -m | awk '/^Mem:/{print $3\"/\"$2}') && echo DISK:$(df -h / | tail -1 | awk '{print $3\"/\"$4}')",
        isLocal);
      break;

    case "restart_gateway": {
      if (isLocal) {
        result = await localRun(
          `systemctl --user restart openclaw-gateway.service && sleep 2 && systemctl --user status openclaw-gateway.service`
        );
      } else if (sshUser === "root" && ocUser !== "root") {
        // Use nsenter for non-root user services when connected as root
        const pidCmd = await sshRun("root", ip, `ps -eo pid,user,comm | grep '${ocUser}.*systemd$' | head -1 | awk '{print $1}'`);
        const pid = pidCmd.stdout.trim();
        if (!pid) {
          result = { stdout: "", error: `Could not find ${ocUser}'s systemd PID` };
        } else {
          result = await sshRun("root", ip,
            `nsenter -t ${pid} -m -p --setuid $(id -u ${ocUser}) --setgid $(id -g ${ocUser}) -- sh -c 'export XDG_RUNTIME_DIR=/run/user/$(id -u ${ocUser}) DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u ${ocUser})/bus && systemctl --user restart openclaw-gateway.service && sleep 2 && systemctl --user status openclaw-gateway.service'`
          );
        }
      } else {
        result = await runOnNode(sshUser, ip,
          `systemctl --user restart openclaw-gateway.service && sleep 2 && systemctl --user status openclaw-gateway.service`,
          isLocal);
      }
      break;
    }

    case "view_logs":
      result = await runOnNode(sshUser, ip,
        `journalctl --user -u openclaw-gateway.service --since '30 min ago' --no-pager | tail -40`,
        isLocal);
      break;

    case "docker_status":
      result = await runOnNode(sshUser, ip,
        "docker ps --format 'table {{.Names}}\\t{{.Status}}\\t{{.Ports}}' 2>/dev/null || echo 'Docker not available'",
        isLocal);
      break;

    case "nginx_status":
      result = await runOnNode(sshUser, ip,
        "nginx -t 2>&1 && systemctl status nginx --no-pager | head -10",
        isLocal);
      break;

    case "force_sync":
      result = await runOnNode(sshUser, ip,
        "echo 'Sync check:' && date && uptime && echo 'Network:' && ip route show default 2>/dev/null | head -1 || echo 'No default route'",
        isLocal);
      break;

    default:
      result = { stdout: "", error: "Unknown action" };
  }

  // Broadcast the action event
  broadcast({
    type: "infra_action",
    payload: {
      nodeId: id,
      nodeName: node.name as string,
      action,
      success: !result.error,
      timestamp: new Date().toISOString(),
    },
  });

  return NextResponse.json({
    ok: !result.error,
    action,
    nodeId: id,
    output: result.stdout,
    error: result.error,
    timestamp: new Date().toISOString(),
  });
}
