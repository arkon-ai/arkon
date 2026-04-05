import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { resolveRole } from "@/app/api/tools/_utils";
import { query } from "@/lib/db";
import { broadcast } from "@/lib/event-bus";

/**
 * Restart the OpenCLAW gateway service via SSH.
 * Used after a nuclear stop or when the gateway needs a bounce.
 *
 * Owner-only access.
 *
 * POST /api/gateway/restart-gateway
 * Body: { reason?: string }
 */

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

/** GET: Check current gateway status */
export async function GET(req: NextRequest) {
  const role = await resolveRole(req);
  if (role !== "owner" && role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sshHost = process.env.GATEWAY_SSH_HOST ?? "";
  const sshUser = process.env.GATEWAY_SSH_USER ?? "brynn";

  if (!sshHost) {
    return NextResponse.json({ error: "No GATEWAY_SSH_HOST configured" }, { status: 503 });
  }

  try {
    const healthOutput = await sshExec(sshHost, sshUser, "openclaw gateway call health --json", 10000);
    const health = JSON.parse(healthOutput);
    return NextResponse.json({
      gateway_host: sshHost,
      status: "online",
      ok: health.ok,
      agent_count: (health.agents ?? []).length,
    });
  } catch {
    // Health failed — check if the service is running at all
    try {
      const statusOutput = await sshExec(
        sshHost, sshUser,
        "systemctl --user is-active openclaw-gateway.service 2>&1",
        8000
      );
      const isActive = statusOutput.trim() === "active";
      return NextResponse.json({
        gateway_host: sshHost,
        status: isActive ? "starting" : "stopped",
        ok: false,
      });
    } catch {
      return NextResponse.json({
        gateway_host: sshHost,
        status: "stopped",
        ok: false,
      });
    }
  }
}

/** POST: Start/restart the gateway */
export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: { reason?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const { reason } = body;
  const sshHost = process.env.GATEWAY_SSH_HOST ?? "";
  const sshUser = process.env.GATEWAY_SSH_USER ?? "brynn";

  if (!sshHost) {
    return NextResponse.json({ error: "No GATEWAY_SSH_HOST configured" }, { status: 503 });
  }

  let restartOk = false;
  let restartDetail = "";

  try {
    // Use restart (handles both stopped and running states)
    await sshExec(
      sshHost, sshUser,
      "systemctl --user restart openclaw-gateway.service",
      20000
    );
    restartOk = true;
    restartDetail = "Gateway restart command sent";
  } catch (err) {
    restartDetail = `Restart failed: ${err instanceof Error ? err.message : "Unknown error"}`;
  }

  // Wait a moment then verify it's actually up
  let verified = false;
  if (restartOk) {
    // Give the gateway a few seconds to start
    await new Promise((r) => setTimeout(r, 4000));

    try {
      const healthOutput = await sshExec(sshHost, sshUser, "openclaw gateway call health --json", 10000);
      const health = JSON.parse(healthOutput);
      verified = health.ok === true;
      if (verified) {
        const agentCount = (health.agents ?? []).length;
        restartDetail = `Gateway online — ${agentCount} agents loaded`;
      } else {
        restartDetail = "Gateway started but health check returned not-ok";
      }
    } catch {
      // Maybe it needs more time — check systemctl
      try {
        const statusOutput = await sshExec(
          sshHost, sshUser,
          "systemctl --user is-active openclaw-gateway.service",
          5000
        );
        if (statusOutput.trim() === "active") {
          verified = false;
          restartDetail = "Service is active but gateway not yet responding — may still be starting";
        }
      } catch {
        verified = false;
        restartDetail = "Gateway failed to start";
        restartOk = false;
      }
    }
  }

  // Audit trail
  try {
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "owner",
        "gateway.restart",
        "gateway",
        sshHost,
        JSON.stringify({
          reason: reason ?? null,
          restart_success: restartOk,
          verified_up: verified,
          detail: restartDetail,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        "default",
      ]
    );
  } catch (err) {
    console.error("[restart-gateway] Audit log error:", err);
  }

  // Broadcast
  broadcast({
    type: "gateway_restarted",
    payload: {
      gateway_host: sshHost,
      restart_success: restartOk,
      verified_up: verified,
      reason: reason ?? null,
    },
  });

  return NextResponse.json({
    ok: restartOk,
    verified_up: verified,
    gateway_host: sshHost,
    detail: restartDetail,
    reason: reason ?? null,
  });
}
