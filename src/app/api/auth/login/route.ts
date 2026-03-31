import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { query } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { logAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string; password?: string };
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }

    // Look up user
    const userResult = await query(
      "SELECT id, email, password_hash, display_name, role, tenant_id, is_active FROM users WHERE email = $1",
      [email.toLowerCase().trim()]
    );

    if (userResult.rows.length === 0) {
      // Timing-safe: still hash to prevent timing oracle
      await verifyPassword(password, "$2a$12$000000000000000000000uGHJWsNMKyGJFqNQGZGRMEfqNqK5Woq");
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const user = userResult.rows[0] as {
      id: number;
      email: string;
      password_hash: string;
      display_name: string | null;
      role: string;
      tenant_id: string | null;
      is_active: boolean;
    };

    if (!user.is_active) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) {
      logAudit({
        actorType: "user",
        actorId: user.id.toString(),
        action: "user.login_failed",
        description: `Failed login attempt for ${email}`,
        ipAddress: getClientIp(req.headers),
        tenantId: user.tenant_id ?? undefined,
      });
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    // Create session
    const sessionToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(sessionToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        user.id,
        tokenHash,
        getClientIp(req.headers),
        req.headers.get("user-agent") ?? "unknown",
        expiresAt.toISOString(),
      ]
    );

    // Update last login
    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    logAudit({
      actorType: "user",
      actorId: user.id.toString(),
      action: "user.login",
      description: `User ${email} logged in`,
      ipAddress: getClientIp(req.headers),
      tenantId: user.tenant_id ?? undefined,
    });

    const isSecure = process.env.NODE_ENV === "production";
    const maxAge = 7 * 24 * 60 * 60; // 7 days
    const csrfToken = randomBytes(32).toString("hex");
    const tenantId = user.tenant_id ?? "*";

    const res = NextResponse.json({
      ok: true,
      role: user.role,
      tenant_id: tenantId,
      display_name: user.display_name,
      email: user.email,
    });

    // Set all cookies to match existing auth flow
    res.cookies.set("mc_auth", sessionToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "strict",
      maxAge,
      path: "/",
    });

    res.cookies.set("mc_csrf", csrfToken, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "strict",
      maxAge,
      path: "/",
    });

    res.cookies.set("mc_role", user.role, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "strict",
      maxAge,
      path: "/",
    });

    res.cookies.set("mc_tenant", tenantId, {
      httpOnly: false,
      secure: isSecure,
      sameSite: "strict",
      maxAge,
      path: "/",
    });

    // Additional cookie to signal this is a user session (not passphrase)
    res.cookies.set("mc_user_session", "1", {
      httpOnly: false,
      secure: isSecure,
      sameSite: "strict",
      maxAge,
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("[auth/login] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
