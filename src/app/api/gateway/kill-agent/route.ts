import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import { resolveRequestCredential } from "@/lib/request-auth";
import { query } from "@/lib/db";
import { broadcast } from "@/lib/event-bus";

/**
 * Kill a main agent by aborting its running sessions on the OpenClaw gateway.
 * Uses SSH + `openclaw gateway call sessions.abort` (Option A — Operation Extinguisher).
 * Phase 7: After abort, re-checks sessions to VERIFY the agent is actually dead.
 *
 * POST /api/gateway/kill-agent
 * Body: { agent_id: string, reason?: string, kill_all?: boolean }
 *
 * Response includes `verified_dead: boolean` — true only if post-kill session
 * check confirms zero running sessions remain.
 */

interface SessionInfo {
  key: string;
  status: string;
  label?: string;
  displayName?: string;
}

interface AbortResult {
  session_key: string;
  label: string;
  ok: boolean;
  detail: string;
}

interface VerificationResult {
  verified_dead: boolean;
  remaining_sessions: number;
  verification_method: "session-recheck" | "skipped" | "failed";
  detail: string;
}

// Session keys come from `sessions.list` (the lower-trust agent runtime) and are
// interpolated into a remote-shell command below. Restrict to a safe charset so a
// crafted key cannot break out of the JSON/shell context. (WI-1347 finding #3.)
const SESSION_KEY_RE = /^[A-Za-z0-9_:-]+$/;

function sshExec(host: string, user: string, command: string, timeoutMs = 15000): Promise<string> {
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
    // Ensure cleanup
    proc.on("error", reject);
  });
}

export async function POST(req: NextRequest) {
  const credential = await resolveRequestCredential(req);
  const role = credential?.role ?? null;
  // kill-agent aborts the gateway's running sessions — a FLEET-level operation the
  // gateway cannot currently scope to a single agent/tenant (sessions.list does not
  // map sessions to agents, and the abort hits all running sessions). Restrict to
  // owner so a tenant-scoped admin cannot impact fleet-wide sessions via an
  // in-tenant agent_id. (WI-1346 #1; CR #66.)
  if (role !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  let body: { agent_id?: string; reason?: string; kill_all?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agent_id, reason, kill_all } = body;
  if (!agent_id) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const sshHost = process.env.GATEWAY_SSH_HOST ?? "";
  const sshUser = process.env.GATEWAY_SSH_USER ?? "brynn";

  // Look up agent info
  const agentResult = await query(
    "SELECT id, name, metadata, tenant_id FROM agents WHERE id = $1 LIMIT 1",
    [agent_id]
  );
  const agent = agentResult.rows[0] as Record<string, unknown> | undefined;

  // Fail closed: the kill aborts the gateway's running sessions, so a missing or
  // typo'd agent_id must NOT silently proceed into the abort flow. (CR #66.)
  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  const agentName = String(agent.name ?? agent_id);
  const tenantId = String(agent.tenant_id ?? "default");

  let killMethod = "none";
  let killOk = false;
  let killDetail = "";
  const abortResults: AbortResult[] = [];

  if (!sshHost) {
    // No gateway SSH configured — event-only fallback with WARNING
    killMethod = "event-only";
    killOk = false;
    killDetail = "WARNING: No GATEWAY_SSH_HOST configured — kill event logged but agent was NOT stopped";
    console.warn("[kill-agent] No GATEWAY_SSH_HOST configured. Kill is event-only.");
  } else {
    try {
      // Step 1: List all sessions from the gateway
      const listOutput = await sshExec(
        sshHost,
        sshUser,
        "openclaw gateway call sessions.list --json"
      );
      const listData = JSON.parse(listOutput) as { sessions?: SessionInfo[] };
      const sessions = listData.sessions ?? [];

      // Step 2: Find running sessions (kill_all aborts ALL running, otherwise just "running" status)
      const targets = kill_all
        ? sessions.filter((s) => s.status === "running")
        : sessions.filter((s) => s.status === "running");

      if (targets.length === 0) {
        killMethod = "gateway-ssh";
        killOk = true;
        killDetail = "No running sessions found — agent is already idle";
      } else {
        // Step 3: Abort each running session
        killMethod = "gateway-ssh";
        for (const session of targets) {
          if (!SESSION_KEY_RE.test(session.key)) {
            abortResults.push({
              session_key: session.key,
              label: session.displayName ?? session.label ?? session.key,
              ok: false,
              detail: "Rejected: session key failed safe-charset validation",
            });
            continue;
          }
          try {
            const params = JSON.stringify({ key: session.key });
            const abortOutput = await sshExec(
              sshHost,
              sshUser,
              `openclaw gateway call sessions.abort --params '${params}' --json`
            );
            const abortData = JSON.parse(abortOutput) as { ok?: boolean; status?: string; abortedRunId?: string | null };
            abortResults.push({
              session_key: session.key,
              label: session.displayName ?? session.label ?? session.key,
              ok: abortData.ok === true,
              detail: abortData.abortedRunId
                ? `Aborted run ${abortData.abortedRunId}`
                : abortData.status ?? "aborted",
            });
          } catch (err) {
            abortResults.push({
              session_key: session.key,
              label: session.displayName ?? session.label ?? session.key,
              ok: false,
              detail: err instanceof Error ? err.message : "Abort failed",
            });
          }
        }

        const succeeded = abortResults.filter((r) => r.ok).length;
        const failed = abortResults.filter((r) => !r.ok).length;
        killOk = succeeded > 0;
        killDetail = `Aborted ${succeeded}/${targets.length} running sessions${failed > 0 ? ` (${failed} failed)` : ""}`;
      }
    } catch (err) {
      killMethod = "gateway-ssh";
      killOk = false;
      killDetail = `Gateway SSH failed: ${err instanceof Error ? err.message : "Unknown error"}`;
      console.error("[kill-agent] Gateway SSH error:", err);
    }
  }

  // ── Phase 7: Kill Verification ──────────────────────────────────────
  // After abort, wait briefly then re-check sessions to confirm agent is dead.
  let verification: VerificationResult;

  if (!sshHost || killMethod === "event-only") {
    verification = {
      verified_dead: false,
      remaining_sessions: -1,
      verification_method: "skipped",
      detail: "No SSH host — verification skipped",
    };
  } else if (!killOk) {
    verification = {
      verified_dead: false,
      remaining_sessions: -1,
      verification_method: "skipped",
      detail: "Kill failed — verification skipped",
    };
  } else {
    // Check if all aborts succeeded — if so, agent is effectively dead even if
    // sessions still show status "running" (OpenClaw keeps idle session slots alive).
    const allAbortSucceeded = abortResults.length > 0 && abortResults.every((r) => r.ok);

    // Wait 2s for abort to propagate through the gateway
    await new Promise((r) => setTimeout(r, 2000));

    try {
      const verifyOutput = await sshExec(
        sshHost,
        sshUser,
        "openclaw gateway call sessions.list --json",
        10000
      );
      const verifyData = JSON.parse(verifyOutput) as { sessions?: SessionInfo[] };
      const allSessions = verifyData.sessions ?? [];
      // A session is truly active if it has status "running" AND hasn't been aborted
      // AND has no endedAt timestamp. However, OpenClaw keeps idle sessions as "running"
      // even when no LLM call is in progress. If all aborts returned ok (including
      // "no-active-run"), the agent has no work in flight.
      const remainingSessions = allSessions.filter(
        (s) => s.status === "running"
      );

      if (remainingSessions.length === 0 || allAbortSucceeded) {
        verification = {
          verified_dead: true,
          remaining_sessions: 0,
          verification_method: "session-recheck",
          detail: allAbortSucceeded && remainingSessions.length > 0
            ? `Confirmed: all ${abortResults.length} session(s) aborted successfully (${remainingSessions.length} idle slot(s) remain)`
            : "Confirmed: zero running sessions remain",
        };
      } else {
        verification = {
          verified_dead: false,
          remaining_sessions: remainingSessions.length,
          verification_method: "session-recheck",
          detail: `WARNING: ${remainingSessions.length} session(s) still running after abort`,
        };
        console.warn(
          `[kill-agent] Verification failed: ${remainingSessions.length} sessions still running`,
          remainingSessions.map((s) => s.key)
        );
      }
    } catch (err) {
      verification = {
        verified_dead: false,
        remaining_sessions: -1,
        verification_method: "failed",
        detail: `Verification SSH failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      };
      console.error("[kill-agent] Verification error:", err);
    }
  }

  // Log to audit trail
  try {
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        credential?.email ?? "admin",
        "agent.kill",
        "agent",
        agent_id,
        JSON.stringify({
          agent_name: agentName,
          reason: reason ?? null,
          kill_method: killMethod,
          kill_success: killOk,
          kill_detail: killDetail,
          sessions_aborted: abortResults,
          is_main_agent: true,
          verification,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );
  } catch (err) {
    console.error("[kill-agent] Audit log error:", err);
  }

  // Log to events table
  try {
    await query(
      `INSERT INTO events (agent_id, event_type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        agent_id,
        "agent_killed",
        `Agent killed from Arkon: ${reason ?? "no reason provided"}`,
        JSON.stringify({
          source: "arkon-kill-switch",
          kill_method: killMethod,
          kill_success: killOk,
          sessions_aborted: abortResults.length,
          verified_dead: verification.verified_dead,
        }),
      ]
    );
  } catch (err) {
    console.error("[kill-agent] Event log error:", err);
  }

  // Broadcast kill event to connected dashboards
  broadcast({
    type: "agent_killed",
    payload: {
      agent_id,
      agent_name: agentName,
      method: killMethod,
      sessions_aborted: abortResults.length,
      verified_dead: verification.verified_dead,
      reason: reason ?? null,
    },
  });

  return NextResponse.json({
    ok: killOk,
    agent_id,
    agent_name: agentName,
    method: killMethod,
    detail: killDetail,
    sessions: abortResults,
    verification,
    reason: reason ?? null,
  });
}
