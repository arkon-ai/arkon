import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { query } from "@/lib/db";
import { resolveRole, resolveUser, unauthorized, forbidden } from "@/app/api/tools/_utils";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) return unauthorized();

  const tenantId = req.cookies.get("mc_tenant")?.value;
  const user = await resolveUser(req);

  let rows;
  if (role === "owner" && (!tenantId || tenantId === "*")) {
    const result = await query(
      `SELECT id, name, key_prefix, scopes, tenant_id, expires_at, last_used_at, is_active, created_at
       FROM api_keys ORDER BY created_at DESC`
    );
    rows = result.rows;
  } else {
    const tid = user?.tenant_id ?? tenantId;
    if (!tid || tid === "*") return unauthorized("No tenant context");
    const result = await query(
      `SELECT id, name, key_prefix, scopes, tenant_id, expires_at, last_used_at, is_active, created_at
       FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tid]
    );
    rows = result.rows;
  }

  return NextResponse.json({ keys: rows });
}

export async function POST(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) return unauthorized();

  const user = await resolveUser(req);
  const tenantId = req.cookies.get("mc_tenant")?.value;
  const tid = user?.tenant_id ?? (tenantId !== "*" ? tenantId : null);

  if (role !== "owner" && !tid) {
    return forbidden("Tenant context required to create API keys");
  }

  try {
    const body = (await req.json()) as {
      name?: string; scopes?: string[]; expires_in_days?: number; tenant_id?: string;
    };

    const keyName = body.name?.trim();
    if (!keyName) {
      return NextResponse.json({ error: "Key name is required" }, { status: 400 });
    }

    const targetTenant = role === "owner" && body.tenant_id ? body.tenant_id : tid;
    if (!targetTenant) {
      return NextResponse.json({ error: "tenant_id required" }, { status: 400 });
    }

    const rawKey = `ak_live_${randomBytes(32).toString("hex")}`;
    const keyPrefix = rawKey.slice(0, 16);
    const keyHash = createHash("sha256").update(rawKey).digest("hex");

    const scopes = body.scopes ?? ["agents:read", "costs:read", "events:read"];
    const validScopes = [
      "agents:read", "agents:write", "costs:read",
      "events:read", "events:write", "infra:read", "traces:read",
    ];
    for (const s of scopes) {
      if (!validScopes.includes(s)) {
        return NextResponse.json({ error: `Invalid scope: ${s}` }, { status: 400 });
      }
    }

    const expiresAt = body.expires_in_days
      ? new Date(Date.now() + body.expires_in_days * 24 * 60 * 60 * 1000)
      : null;

    const result = await query(
      `INSERT INTO api_keys (tenant_id, user_id, name, key_prefix, key_hash, scopes, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, key_prefix, scopes, tenant_id, expires_at, created_at`,
      [targetTenant, user?.id ?? null, keyName, keyPrefix, keyHash, scopes, expiresAt?.toISOString() ?? null]
    );

    logAudit({
      actorType: "user",
      actorId: user?.id?.toString() ?? "owner",
      action: "api_key.created",
      targetType: "api_key",
      targetId: result.rows[0].id.toString(),
      description: `Created API key "${keyName}" for tenant ${targetTenant}`,
      metadata: { scopes, expires_at: expiresAt },
      ipAddress: getClientIp(req.headers),
      tenantId: targetTenant,
    });

    return NextResponse.json({
      ok: true,
      key: { ...result.rows[0], raw_key: rawKey },
      warning: "Save this key now. It cannot be retrieved again.",
    }, { status: 201 });
  } catch (err) {
    console.error("[client/api-keys] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) return unauthorized();

  const user = await resolveUser(req);
  const tenantId = req.cookies.get("mc_tenant")?.value;

  try {
    const body = (await req.json()) as { id?: number };
    if (!body.id) {
      return NextResponse.json({ error: "Key ID required" }, { status: 400 });
    }

    const existing = await query("SELECT id, tenant_id, name FROM api_keys WHERE id = $1", [body.id]);
    if (existing.rows.length === 0) {
      return NextResponse.json({ error: "Key not found" }, { status: 404 });
    }

    const key = existing.rows[0] as { id: number; tenant_id: string; name: string };

    if (role !== "owner" && key.tenant_id !== (user?.tenant_id ?? tenantId)) {
      return forbidden("Cannot revoke keys from other tenants");
    }

    await query("UPDATE api_keys SET is_active = FALSE WHERE id = $1", [body.id]);

    logAudit({
      actorType: "user",
      actorId: user?.id?.toString() ?? "owner",
      action: "api_key.revoked",
      targetType: "api_key",
      targetId: body.id.toString(),
      description: `Revoked API key "${key.name}"`,
      ipAddress: getClientIp(req.headers),
      tenantId: key.tenant_id,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[client/api-keys] DELETE error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
