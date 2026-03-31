import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";
import { resolveRole } from "@/app/api/tools/_utils";
import type { UserRole } from "@/lib/rbac";

/**
 * POST /api/auth/register — Create a new user account (owner-only).
 */
export async function POST(req: NextRequest) {
  // Only owners can create users
  const callerRole = await resolveRole(req);
  if (callerRole !== "owner") {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      display_name?: string;
      role?: string;
      tenant_id?: string;
    };

    const { email, password, display_name, role = "viewer", tenant_id } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.reason }, { status: 400 });
    }

    // Validate role
    const validRoles: UserRole[] = ["owner", "admin", "operator", "viewer", "tenant_user"];
    if (!validRoles.includes(role as UserRole)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    // tenant_user must have a tenant_id
    if (role === "tenant_user" && !tenant_id) {
      return NextResponse.json({ error: "tenant_id required for tenant_user role" }, { status: 400 });
    }

    // Verify tenant exists if specified
    if (tenant_id) {
      const tenantResult = await query("SELECT id FROM tenants WHERE id = $1", [tenant_id]);
      if (tenantResult.rows.length === 0) {
        return NextResponse.json({ error: `Tenant '${tenant_id}' not found` }, { status: 400 });
      }
    }

    const passwordHash = await hashPassword(password);

    const result = await query(
      `INSERT INTO users (email, password_hash, display_name, role, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, display_name, role, tenant_id, created_at`,
      [
        email.toLowerCase().trim(),
        passwordHash,
        display_name ?? null,
        role,
        tenant_id ?? null,
      ]
    );

    const user = result.rows[0];

    logAudit({
      actorType: "user",
      actorId: "owner",
      action: "user.created",
      targetType: "user",
      targetId: user.id.toString(),
      description: `Created user ${email} with role ${role}`,
      newValue: { email, role, tenant_id },
      ipAddress: getClientIp(req.headers),
      tenantId: tenant_id ?? undefined,
    });

    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    if (msg.includes("duplicate key") && msg.includes("users_email_key")) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }
    console.error("[auth/register] Error:", err instanceof Error ? err.stack : err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
