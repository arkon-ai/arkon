import { NextRequest, NextResponse } from "next/server";
import { resolveRequestCredential } from "@/lib/request-auth";
import { query } from "@/lib/db";
import { broadcast } from "@/lib/event-bus";
import { createHash, randomBytes, randomUUID } from "crypto";

/**
 * Register agents from the wizard.
 *
 * POST /api/agents/register
 * Body: {
 *   frameworkId, tenantId, location, address, port,
 *   tlsFingerprint?, token?, sshHost?, sshUser?, sshKey?,
 *   agents: Array<{ agentId, name, tags?, isDefault? }>
 * }
 */

interface AgentEntry {
  agentId: string;
  name: string;
  tags?: string[];
  isDefault?: boolean;
}

interface RegisterBody {
  frameworkId: string;
  tenantId: string;
  location: string;
  address: string;
  port: number;
  tlsFingerprint?: string;
  token?: string;
  sshHost?: string;
  sshUser?: string;
  sshKey?: string;
  agents: AgentEntry[];
}

export async function POST(req: NextRequest) {
  const credential = await resolveRequestCredential(req);
  const role = credential?.role ?? null;
  if (!role || (role !== "owner" && role !== "admin")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RegisterBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    frameworkId, tenantId, location, address, port,
    tlsFingerprint, token, sshHost, sshUser, sshKey, agents,
  } = body;

  if (!frameworkId || !tenantId || !address || !port || !agents?.length) {
    return NextResponse.json(
      { error: "Missing required fields: frameworkId, tenantId, address, port, agents" },
      { status: 400 },
    );
  }

  // Non-owners may only register agents (and mint their tokens) into their OWN
  // tenant — ignore a body-supplied tenantId for them. Only an owner may target
  // an arbitrary tenant. (WI-1346 finding #2: a tenant 'admin' could otherwise
  // create token-bearing agents bound to a victim tenant.)
  let effectiveTenantId = tenantId;
  if (role !== "owner") {
    if (!credential?.tenant_id || credential.tenant_id === "*") {
      return NextResponse.json({ error: "Forbidden: no tenant scope" }, { status: 403 });
    }
    effectiveTenantId = credential.tenant_id;
  }

  const registeredIds: string[] = [];
  const generatedTokens: Array<{ agentId: string; token: string }> = [];
  const errors: Array<{ agentId: string; error: string }> = [];

  for (const agent of agents) {
    const id = randomUUID();
    const effectiveToken = token || randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(effectiveToken).digest("hex");
    const tokenWasGenerated = !token;

    const connectivityConfig = {
      framework: frameworkId,
      protocol: frameworkId === "openclaw" ? "ws-rpc" : "rest",
      location,
      host: address,
      port,
      tls: {
        enabled: !!tlsFingerprint || frameworkId === "openclaw",
        fingerprint: tlsFingerprint || null,
      },
      auth: {
        type: frameworkId === "openclaw" ? "token" : "bearer",
      },
      ssh: sshHost || sshUser ? {
        host: sshHost || address,
        user: sshUser || "brynn",
        keyPath: sshKey || null,
      } : null,
      sourceAgentId: agent.agentId,
      isDefault: agent.isDefault ?? false,
    };

    const metadata = {
      connectivity: connectivityConfig,
      tags: agent.tags ?? [],
    };

    try {
      await query(
        `INSERT INTO agents (id, name, token_hash, role, tenant_id, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           metadata = EXCLUDED.metadata,
           updated_at = NOW()`,
        [
          id,
          agent.name,
          tokenHash,
          "agent",
          effectiveTenantId,
          JSON.stringify(metadata),
        ],
      );
      registeredIds.push(id);
      if (tokenWasGenerated) {
        generatedTokens.push({ agentId: agent.agentId, token: effectiveToken });
      }
    } catch (err) {
      errors.push({
        agentId: agent.agentId,
        error: err instanceof Error ? err.message : "Database insert failed",
      });
    }
  }

  // Log to audit trail
  try {
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        credential?.email ?? "admin",
        "agent.register",
        "agent",
        registeredIds[0] ?? "batch",
        JSON.stringify({
          framework: frameworkId,
          agents_registered: registeredIds.length,
          agents_failed: errors.length,
          host: address,
          port,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        effectiveTenantId,
      ],
    );
  } catch (err) {
    console.error("[agent-register] Audit log error:", err);
  }

  // Broadcast registration event
  broadcast({
    type: "agents_registered",
    payload: {
      framework: frameworkId,
      count: registeredIds.length,
      ids: registeredIds,
      tenant_id: effectiveTenantId,
    },
  });

  return NextResponse.json({
    ok: errors.length === 0,
    registered: registeredIds,
    generatedTokens: generatedTokens.length > 0 ? generatedTokens : undefined,
    errors: errors.length > 0 ? errors : undefined,
  });
}
