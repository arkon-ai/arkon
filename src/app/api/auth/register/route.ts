import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { hashPassword, validatePasswordStrength } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";
import { validateOwner } from "@/app/api/tools/_utils";
import type { UserRole } from "@/lib/rbac";

const VALID_ROLES: UserRole[] = ["owner", "admin", "operator", "viewer", "tenant_user"];
const ACCEPTED_FIELDS = ["email", "password", "display_name", "role", "tenant_id"];

function badRequest(error: string) {
  return NextResponse.json({ error }, { status: 400 });
}

/**
 * POST /api/auth/register - Create a new user account (platform owner only; transformate WI-4994).
 * THE GATE: only the platform owner (validateOwner: the owner key by Bearer, or an active session of a users row with
 * role owner and tenant_id NULL). Every other caller, a tenant-bound owner included (tenant_id "" too), gets 403 and
 * zero users row before the body is read.
 * THE ACCEPTED SET: a JSON object with only email, password, display_name, role and tenant_id. email: a string that
 * matches the regex below; password: a string that passes validatePasswordStrength; display_name: absent or a string;
 * role: absent (stored as viewer) or one of VALID_ROLES; tenant_id: absent or null (stored as NULL; refused for
 * tenant_user), or a non-empty string other than "*" that names a tenants row. Anything else: 400 and zero users row.
 */
export async function POST(req: NextRequest) {
  // THE GATE, the first statement: a refused caller's body is never parsed.
  if (!(await validateOwner(req))) {
    return NextResponse.json({ error: "Owner access required" }, { status: 403 });
  }

  try {
    let parsed: unknown;
    try {
      parsed = await req.json();
    } catch {
      return badRequest("Body must be a JSON object");
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return badRequest("Body must be a JSON object");
    }
    const body = parsed as Record<string, unknown>;
    if (Object.keys(body).some((key) => !ACCEPTED_FIELDS.includes(key))) {
      return badRequest(`Unknown field in body. Accepted fields: ${ACCEPTED_FIELDS.join(", ")}`);
    }

    const { email, password, display_name } = body;

    if (email === undefined || password === undefined || email === "" || password === "") {
      return badRequest("Email and password required");
    }
    if (typeof email !== "string" || typeof password !== "string") {
      return badRequest("Email and password must be strings");
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return badRequest("Invalid email format");
    }

    // Validate password strength
    const strength = validatePasswordStrength(password);
    if (!strength.valid) {
      return NextResponse.json({ error: strength.reason }, { status: 400 });
    }

    if (display_name !== undefined && typeof display_name !== "string") {
      return badRequest("display_name must be a string");
    }

    // Validate role: absent is viewer (the one role default)
    const role = body.role === undefined ? "viewer" : body.role;
    if (typeof role !== "string" || !VALID_ROLES.includes(role as UserRole)) {
      return badRequest(`Invalid role. Must be one of: ${VALID_ROLES.join(", ")}`);
    }

    // Validate tenant_id: absent or null is NULL (the one tenant default); never inferred from the caller
    const tenantField = body.tenant_id;
    if (tenantField !== undefined && tenantField !== null && (typeof tenantField !== "string" || tenantField === "" || tenantField === "*")) {
      return badRequest('tenant_id must be null or a non-empty tenant id other than "*"');
    }
    const tenant_id = typeof tenantField === "string" ? tenantField : null;

    // tenant_user must have a tenant_id
    if (role === "tenant_user" && tenant_id === null) {
      return badRequest("tenant_id required for tenant_user role");
    }

    // Verify tenant exists if specified
    if (tenant_id !== null) {
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
