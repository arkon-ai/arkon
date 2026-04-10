import { createHash, randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { forbidden, unauthorized, validateRole, resolveUser } from "@/app/api/tools/_utils";
import { logAudit, getClientIp } from "@/lib/audit";

// GET /api/admin/agents — list all agents with role and tenant info
export async function GET(req: NextRequest) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const result = await query(
    `SELECT a.id, a.name, a.role, a.tenant_id, a.created_at, a.updated_at, a.metadata,
            a.default_provider, a.default_model_id,
            t.name as tenant_name,
            mp.display_name      as default_model_display_name,
            mp.pricing_type      as default_model_pricing_type,
            mp.cost_per_1k_input as default_model_cost_per_1k_input,
            mp.cost_per_1k_output as default_model_cost_per_1k_output,
            mp.monthly_cost_usd  as default_model_monthly_cost_usd
     FROM agents a
     LEFT JOIN tenants t ON t.id = a.tenant_id
     LEFT JOIN LATERAL (
       SELECT display_name, pricing_type, cost_per_1k_input, cost_per_1k_output, monthly_cost_usd
       FROM model_pricing
       WHERE provider = a.default_provider
         AND model_id = a.default_model_id
         AND (effective_until IS NULL OR effective_until >= CURRENT_DATE)
       ORDER BY effective_from DESC
       LIMIT 1
     ) mp ON true
     ORDER BY t.name, a.name`
  );
  return NextResponse.json({ agents: result.rows });
}

// POST /api/admin/agents — create a new agent (with optional tenant + provisioning)
export async function POST(req: NextRequest) {
  const body = await req.json() as {
    id?: string;
    name?: string;
    agentRole?: string;
    tenant_id?: string;
    tenant_name?: string;
    action?: string;
    provisioning_token?: string;
  };

  // Provisioning flow — DFY install scripts use this
  if (body.action === "provision") {
    const provToken = process.env.MC_PROVISIONING_TOKEN;
    if (!provToken || body.provisioning_token !== provToken) {
      return NextResponse.json({ error: "Invalid provisioning token" }, { status: 401 });
    }

    const { id, name, tenant_id, tenant_name } = body;
    if (!id || !name || !tenant_id) {
      return NextResponse.json({ error: "id, name, and tenant_id required for provisioning" }, { status: 400 });
    }

    // Auto-create tenant if it doesn't exist
    await query(
      `INSERT INTO tenants (id, name, plan) VALUES ($1, $2, 'dfy')
       ON CONFLICT (id) DO NOTHING`,
      [tenant_id.toLowerCase().trim(), tenant_name || tenant_id]
    );

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");

    try {
      await query(
        "INSERT INTO agents (id, name, token_hash, role, tenant_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
        [id.toLowerCase().trim(), name.trim(), tokenHash, "agent", tenant_id.toLowerCase().trim(), {}]
      );

      logAudit({
        actorType: "system",
        actorId: "provisioning",
        action: "agent.provisioned",
        targetType: "agent",
        targetId: id,
        description: `Provisioned agent "${name}" for tenant ${tenant_id}`,
        newValue: { id, name, tenant_id, role: "agent" },
        ipAddress: getClientIp(req.headers),
        tenantId: tenant_id,
      });

      return NextResponse.json({ ok: true, agentId: id, token, tenant_id, role: "agent" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      if (msg.includes("duplicate key")) {
        return NextResponse.json({ error: `Agent ID "${id}" already exists` }, { status: 409 });
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  // Standard agent creation (owner only)
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const { id, name, agentRole = "agent", tenant_id = "transformate" } = body;
  if (!id || !name) {
    return NextResponse.json({ error: "id and name required" }, { status: 400 });
  }
  if (!["owner", "admin", "agent", "viewer"].includes(agentRole)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");

  try {
    await query(
      "INSERT INTO agents (id, name, token_hash, role, tenant_id, metadata) VALUES ($1, $2, $3, $4, $5, $6)",
      [id.toLowerCase().trim(), name.trim(), tokenHash, agentRole, tenant_id, {}]
    );

    const user = await resolveUser(req);
    logAudit({
      actorType: user ? "user" : "system",
      actorId: user?.email ?? "owner",
      action: "agent.created",
      targetType: "agent",
      targetId: id,
      description: `Created agent "${name}" with role ${agentRole}`,
      newValue: { id, name, role: agentRole, tenant_id },
      ipAddress: getClientIp(req.headers),
      tenantId: tenant_id,
    });

    return NextResponse.json({ ok: true, agentId: id, token, role: agentRole, tenant_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate key")) {
      return NextResponse.json({ error: `Agent ID "${id}" already exists` }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH /api/admin/agents — update role, tenant, or rotate token
export async function PATCH(req: NextRequest) {
  const role = await validateRole(req, "owner");
  if (!role) return unauthorized();
  if (role !== "owner") return forbidden("Owner only");

  const body = await req.json() as {
    id?: string;
    action?: string;
    newRole?: string;
    tenant_id?: string;
    default_provider?: string | null;
    default_model_id?: string | null;
  };

  const { id, action, newRole, tenant_id, default_provider, default_model_id } = body;
  if (!id || !action) {
    return NextResponse.json({ error: "id and action required" }, { status: 400 });
  }

  const user = await resolveUser(req);
  const actorId = user?.email ?? "owner";

  if (action === "rotate_token") {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await query("UPDATE agents SET token_hash = $1, updated_at = NOW() WHERE id = $2", [tokenHash, id]);

    logAudit({
      actorType: user ? "user" : "system",
      actorId,
      action: "agent.token_rotated",
      targetType: "agent",
      targetId: id,
      description: `Rotated token for agent ${id}`,
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true, token });
  }

  if (action === "set_role") {
    if (!newRole || !["owner", "admin", "agent", "viewer"].includes(newRole)) {
      return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    }

    // Get old role for audit diff
    const oldResult = await query("SELECT role FROM agents WHERE id = $1", [id]);
    const oldRole = oldResult.rows[0] ? (oldResult.rows[0] as { role: string }).role : undefined;

    await query("UPDATE agents SET role = $1, updated_at = NOW() WHERE id = $2", [newRole, id]);

    logAudit({
      actorType: user ? "user" : "system",
      actorId,
      action: "agent.role_changed",
      targetType: "agent",
      targetId: id,
      description: `Changed agent ${id} role from ${oldRole} to ${newRole}`,
      oldValue: { role: oldRole },
      newValue: { role: newRole },
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true, role: newRole });
  }

  if (action === "set_tenant") {
    if (!tenant_id) {
      return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    }

    const oldResult = await query("SELECT tenant_id FROM agents WHERE id = $1", [id]);
    const oldTenant = oldResult.rows[0] ? (oldResult.rows[0] as { tenant_id: string }).tenant_id : undefined;

    await query("UPDATE agents SET tenant_id = $1, updated_at = NOW() WHERE id = $2", [tenant_id, id]);

    logAudit({
      actorType: user ? "user" : "system",
      actorId,
      action: "agent.tenant_changed",
      targetType: "agent",
      targetId: id,
      description: `Moved agent ${id} from tenant ${oldTenant} to ${tenant_id}`,
      oldValue: { tenant_id: oldTenant },
      newValue: { tenant_id },
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true, tenant_id });
  }

  if (action === "set_default_model") {
    // default_provider + default_model_id may be null to clear, or a valid model_pricing row
    if (default_provider && default_model_id) {
      const exists = await query(
        `SELECT 1 FROM model_pricing
         WHERE provider = $1 AND model_id = $2
         LIMIT 1`,
        [default_provider, default_model_id]
      );
      if (exists.rows.length === 0) {
        return NextResponse.json(
          { error: `No model_pricing row for ${default_provider}/${default_model_id}` },
          { status: 400 }
        );
      }
    }

    const oldResult = await query(
      "SELECT default_provider, default_model_id FROM agents WHERE id = $1",
      [id]
    );
    const oldRow = oldResult.rows[0] as { default_provider: string | null; default_model_id: string | null } | undefined;

    await query(
      "UPDATE agents SET default_provider = $1, default_model_id = $2, updated_at = NOW() WHERE id = $3",
      [default_provider ?? null, default_model_id ?? null, id]
    );

    logAudit({
      actorType: user ? "user" : "system",
      actorId,
      action: "agent.default_model_changed",
      targetType: "agent",
      targetId: id,
      description: `Set default model for ${id} to ${default_provider ?? "null"}/${default_model_id ?? "null"}`,
      oldValue: oldRow,
      newValue: { default_provider, default_model_id },
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true, default_provider, default_model_id });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
