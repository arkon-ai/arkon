import { type NextRequest, NextResponse } from "next/server";
import { randomBytes, timingSafeEqual, createHash } from "crypto";
import { resolveRole } from "@/app/api/tools/_utils";
import { query } from "@/lib/db";

/**
 * SEC-1: Auth init endpoint
 * Called on first app load with the token as a Bearer header.
 * If valid, sets cookies:
 *   - mc_auth: httpOnly, Secure — the raw token for API calls
 *   - mc_csrf: SameSite=Strict — CSRF token for mutation requests
 *   - mc_role: readable by JS — the resolved role (owner/admin/agent/viewer)
 *   - mc_tenant: readable by JS — the tenant ID (or "*" for owner)
 */
export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const providedToken = auth?.startsWith("Bearer ") ? auth.slice(7).trim() : null;
  const adminToken = process.env.MC_ADMIN_TOKEN ?? "";

  if (!providedToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check owner token first (constant-time)
  let role: string | null = null;
  let tenantId: string = "*";

  if (adminToken) {
    try {
      const a = Buffer.from(providedToken.padEnd(64));
      const b = Buffer.from(adminToken.padEnd(64));
      const match = timingSafeEqual(a.slice(0, 64), b.slice(0, 64)) && providedToken.length === adminToken.length;
      if (match) role = "owner";
    } catch {
      // fall through
    }
  }

  // If not owner, check DB for admin/viewer/agent tokens
  if (!role) {
    role = await resolveRole(req);

    // Resolve tenant_id from agent token
    if (role) {
      try {
        const hash = createHash("sha256").update(providedToken).digest("hex");
        const result = await query(
          "SELECT tenant_id FROM agents WHERE token_hash = $1 LIMIT 1",
          [hash]
        );
        const rows = result.rows as Array<{ tenant_id: string }>;
        if (rows.length > 0 && rows[0].tenant_id) {
          tenantId = rows[0].tenant_id;
        }
      } catch {
        // Fall through — tenant stays "*"
      }
    }
  }

  if (!role) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const csrfToken = randomBytes(32).toString("hex");
  const isSecure = process.env.NODE_ENV === "production";
  const maxAge = 60 * 60 * 24 * 7; // 7 days

  const res = NextResponse.json({ ok: true, role, tenant_id: tenantId });

  // httpOnly — not readable by JS
  res.cookies.set("mc_auth", providedToken, {
    httpOnly: true,
    secure: isSecure,
    sameSite: "strict",
    maxAge,
    path: "/",
  });

  // CSRF — readable by JS (sent as header on mutations)
  res.cookies.set("mc_csrf", csrfToken, {
    httpOnly: false,
    secure: isSecure,
    sameSite: "strict",
    maxAge,
    path: "/",
  });

  // Role — readable by JS so client can render role-appropriate UI
  res.cookies.set("mc_role", role, {
    httpOnly: false,
    secure: isSecure,
    sameSite: "strict",
    maxAge,
    path: "/",
  });

  // Tenant — readable by JS for client portal routing
  res.cookies.set("mc_tenant", tenantId, {
    httpOnly: false,
    secure: isSecure,
    sameSite: "strict",
    maxAge,
    path: "/",
  });

  return res;
}
