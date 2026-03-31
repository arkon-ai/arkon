import { NextRequest, NextResponse } from "next/server";
import { resolveRole } from "@/app/api/tools/_utils";
import { query } from "@/lib/db";

/**
 * Kill a main agent by sending a shutdown command through the OpenClaw gateway.
 * For agents on other frameworks (NemoClaw, Hermes, etc.), sends a generic kill event.
 *
 * POST /api/gateway/kill-agent
 * Body: { agent_id: string, reason?: string }
 */
export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role || (role !== "owner" && role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { agent_id?: string; reason?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { agent_id, reason } = body;
  if (!agent_id) {
    return NextResponse.json({ error: "agent_id is required" }, { status: 400 });
  }

  const gatewayUrl = process.env.GATEWAY_URL ?? "";
  const gatewayToken = process.env.GATEWAY_TOKEN ?? "";

  // Look up agent info
  const agentResult = await query(
    "SELECT id, name, metadata, tenant_id FROM agents WHERE id = $1 LIMIT 1",
    [agent_id]
  );
  const agent = agentResult.rows[0] as Record<string, unknown> | undefined;
  const agentName = agent ? String(agent.name ?? agent_id) : agent_id;
  const tenantId = agent ? String(agent.tenant_id ?? "default") : "default";

  let killResult: { ok: boolean; method: string; detail?: string } = {
    ok: false,
    method: "none",
  };

  // Attempt gateway kill if configured
  if (gatewayUrl && gatewayToken) {
    try {
      const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/api/system-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({
          type: "agent_kill",
          agent_id,
          reason: reason ?? "Killed from Arkon",
          source: "arkon-kill-switch",
        }),
        signal: AbortSignal.timeout(8000),
      });

      killResult = {
        ok: res.ok,
        method: "gateway",
        detail: res.ok ? "Kill command sent via gateway" : `Gateway returned ${res.status}`,
      };
    } catch (err) {
      killResult = {
        ok: false,
        method: "gateway",
        detail: err instanceof Error ? err.message : "Gateway unreachable",
      };
    }
  } else {
    killResult = {
      ok: true,
      method: "event-only",
      detail: "No gateway configured — logged kill event only",
    };
  }

  // Log to audit trail regardless of gateway result
  try {
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        "agent.kill",
        "agent",
        agent_id,
        JSON.stringify({
          agent_name: agentName,
          reason: reason ?? null,
          kill_method: killResult.method,
          kill_success: killResult.ok,
          kill_detail: killResult.detail,
          is_main_agent: true,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );
  } catch (err) {
    console.error("[kill-agent] Audit log error:", err);
  }

  // Log to events table so the agent drops off "Live" status
  try {
    await query(
      `INSERT INTO events (agent_id, event_type, content, metadata, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        agent_id,
        "agent_killed",
        `Agent killed from Arkon: ${reason ?? "no reason provided"}`,
        JSON.stringify({ source: "arkon-kill-switch", kill_method: killResult.method }),
      ]
    );
  } catch (err) {
    console.error("[kill-agent] Event log error:", err);
  }

  return NextResponse.json({
    ok: killResult.ok,
    agent_id,
    agent_name: agentName,
    method: killResult.method,
    detail: killResult.detail,
    reason: reason ?? null,
  });
}
