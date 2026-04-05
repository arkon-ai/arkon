import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { resolveRole } from "@/app/api/tools/_utils";
import { query } from "@/lib/db";
import { broadcast } from "@/lib/event-bus";

/**
 * NUCLEAR: Stop the entire OpenCLAW gateway service via SSH.
 * This kills ALL sessions, ALL agents, ALL channels. The gateway must be
 * manually restarted after this action.
 *
 * Owner-only. Requires double-confirmation from the UI (confirm_code = "STOP").
 *
 * POST /api/gateway/stop-gateway
 * Body: { confirm_code: "STOP", reason?: string }
 */

interface GatewayHealthSummary {
  ok: boolean;
  session_count: number;
  agent_count: number;
  running_sessions: number;
}

function sshExec(host: string, user: string, command: string, timeoutMs = 20000): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = execFile(
      "ssh",
      [
        "-o", "BatchMode=yes",
        "-o", `ConnectTimeout=${Math.ceil(timeoutMs / 2000)}`,
        "-o", "StrictHostKeyChecking=accept-new",
        `${user}@${host}`,
        command,
      ],
      { timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) {
          reject(new Error(stderr?.trim() || err.message));
        } else {
          resolve(stdout);
        }
      }
    );
    proc.on("error", reject);
  });
}

/** GET: Pre-flight check — returns gateway status summary before nuclear stop */
export async function GET(req: NextRequest) {
  const role = await resolveRole(req);
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  const sshHost = process.env.GATEWAY_SSH_HOST ?? "";
  const sshUser = process.env.GATEWAY_SSH_USER ?? "brynn";

  if (!sshHost) {
    return NextResponse.json({ error: "No GATEWAY_SSH_HOST configured" }, { status: 503 });
  }

  try {
    // Get health info
    const healthOutput = await sshExec(sshHost, sshUser, "openclaw gateway call health --json");
    const health = JSON.parse(healthOutput);

    // Get session counts
    const listOutput = await sshExec(sshHost, sshUser, "openclaw gateway call sessions.list --json");
    const listData = JSON.parse(listOutput);
    const sessions = listData.sessions ?? [];
    const running = sessions.filter((s: { status: string }) => s.status === "running");

    const summary: GatewayHealthSummary = {
      ok: health.ok === true,
      session_count: listData.count ?? sessions.length,
      agent_count: (health.agents ?? []).length,
      running_sessions: running.length,
    };

    return NextResponse.json({
      gateway_host: sshHost,
      gateway_status: "online",
      ...summary,
      agents: (health.agents ?? []).map((a: { agentId: string; isDefault: boolean }) => ({
        id: a.agentId,
        is_default: a.isDefault,
      })),
      warning: "This will stop the ENTIRE OpenCLAW gateway. All agents, sessions, and channels will go offline. Manual restart required.",
    });
  } catch (err) {
    return NextResponse.json({
      gateway_host: sshHost,
      gateway_status: "unreachable",
      error: err instanceof Error ? err.message : "Cannot reach gateway",
    });
  }
}

/** POST: Execute nuclear gateway stop */
export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required — nuclear stop is owner-only" }, { status: 403 });
  }

  let body: { confirm_code?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { confirm_code, reason } = body;

  // Double-confirmation required
  if (confirm_code !== "STOP") {
    return NextResponse.json(
      { error: "Confirmation required: send confirm_code = \"STOP\" to proceed" },
      { status: 400 }
    );
  }

  const sshHost = process.env.GATEWAY_SSH_HOST ?? "";
  const sshUser = process.env.GATEWAY_SSH_USER ?? "brynn";

  if (!sshHost) {
    return NextResponse.json({ error: "No GATEWAY_SSH_HOST configured" }, { status: 503 });
  }

  // Snapshot before kill — capture what we're about to destroy
  let preStopSnapshot: { session_count: number; running_sessions: number; agent_count: number } | null = null;
  try {
    const listOutput = await sshExec(sshHost, sshUser, "openclaw gateway call sessions.list --json");
    const listData = JSON.parse(listOutput);
    const sessions = listData.sessions ?? [];
    preStopSnapshot = {
      session_count: listData.count ?? sessions.length,
      running_sessions: sessions.filter((s: { status: string }) => s.status === "running").length,
      agent_count: 0,
    };
    const healthOutput = await sshExec(sshHost, sshUser, "openclaw gateway call health --json");
    const health = JSON.parse(healthOutput);
    preStopSnapshot.agent_count = (health.agents ?? []).length;
  } catch {
    // Continue anyway — we're stopping regardless
  }

  // Execute nuclear stop
  let stopOk = false;
  let stopDetail = "";

  try {
    const stopOutput = await sshExec(
      sshHost,
      sshUser,
      "openclaw gateway stop --json 2>&1 || systemctl --user stop openclaw-gateway.service 2>&1 && echo '{\"ok\":true,\"method\":\"systemctl\"}'",
      25000
    );
    stopDetail = stopOutput.trim();
    stopOk = true;
  } catch (err) {
    // If `openclaw gateway stop` fails, try systemctl directly
    try {
      await sshExec(sshHost, sshUser, "systemctl --user stop openclaw-gateway.service", 15000);
      stopOk = true;
      stopDetail = "Stopped via systemctl fallback";
    } catch (err2) {
      stopOk = false;
      stopDetail = `Both stop methods failed. openclaw: ${err instanceof Error ? err.message : "?"}, systemctl: ${err2 instanceof Error ? err2.message : "?"}`;
    }
  }

  // Verify gateway is actually down
  let verified = false;
  if (stopOk) {
    try {
      await sshExec(sshHost, sshUser, "openclaw gateway call health --json --timeout 3000", 8000);
      // If health succeeds, gateway is still running
      verified = false;
      stopDetail += " — WARNING: Gateway still responding after stop command";
    } catch {
      // Health failed = gateway is down = good
      verified = true;
    }
  }

  // Audit trail
  try {
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "owner",
        "gateway.emergency_stop",
        "gateway",
        sshHost,
        JSON.stringify({
          reason: reason ?? null,
          stop_success: stopOk,
          verified_down: verified,
          pre_stop_snapshot: preStopSnapshot,
          stop_detail: stopDetail,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        "default",
      ]
    );
  } catch (err) {
    console.error("[stop-gateway] Audit log error:", err);
  }

  // Log event
  try {
    await query(
      `INSERT INTO events (agent_id, event_type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        "system",
        "gateway_stopped",
        `NUCLEAR: OpenCLAW gateway stopped from Arkon. Reason: ${reason ?? "none provided"}`,
        JSON.stringify({
          source: "arkon-nuclear-stop",
          gateway_host: sshHost,
          stop_success: stopOk,
          verified_down: verified,
          sessions_killed: preStopSnapshot?.session_count ?? 0,
        }),
      ]
    );
  } catch (err) {
    console.error("[stop-gateway] Event log error:", err);
  }

  // Broadcast to all connected dashboards
  broadcast({
    type: "gateway_stopped",
    payload: {
      gateway_host: sshHost,
      stop_success: stopOk,
      verified_down: verified,
      reason: reason ?? null,
      sessions_killed: preStopSnapshot?.session_count ?? 0,
    },
  });

  return NextResponse.json({
    ok: stopOk,
    verified_down: verified,
    gateway_host: sshHost,
    method: "nuclear-gateway-stop",
    detail: stopDetail,
    pre_stop_snapshot: preStopSnapshot,
    reason: reason ?? null,
  });
}
