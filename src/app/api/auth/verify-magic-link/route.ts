import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { query } from "@/lib/db";
import { logAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string; email?: string };
    const { token, email } = body;

    if (!token || !email) {
      return NextResponse.json({ error: "Token and email required" }, { status: 400 });
    }

    const tokenHash = createHash("sha256").update(token).digest("hex");

    const tokenResult = await query(
      `SELECT id, email FROM magic_link_tokens
       WHERE token_hash = $1 AND email = $2 AND used_at IS NULL AND expires_at > NOW()
       LIMIT 1`,
      [tokenHash, email.toLowerCase().trim()]
    );

    if (tokenResult.rows.length === 0) {
      return NextResponse.json({ error: "Invalid or expired link" }, { status: 401 });
    }

    const magicToken = tokenResult.rows[0] as { id: number; email: string };
    await query("UPDATE magic_link_tokens SET used_at = NOW() WHERE id = $1", [magicToken.id]);

    const userResult = await query(
      "SELECT id, email, display_name, role, tenant_id, is_active FROM users WHERE email = $1",
      [magicToken.email]
    );

    if (userResult.rows.length === 0) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const user = userResult.rows[0] as {
      id: number; email: string; display_name: string | null;
      role: string; tenant_id: string | null; is_active: boolean;
    };

    if (!user.is_active) {
      return NextResponse.json({ error: "Account disabled" }, { status: 403 });
    }

    const sessionToken = randomBytes(32).toString("hex");
    const sessionHash = createHash("sha256").update(sessionToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await query(
      `INSERT INTO user_sessions (user_id, token_hash, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, sessionHash, getClientIp(req.headers), req.headers.get("user-agent") ?? "unknown", expiresAt.toISOString()]
    );

    await query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

    logAudit({
      actorType: "user",
      actorId: user.id.toString(),
      action: "user.login_magic_link",
      description: `User ${user.email} logged in via magic link`,
      ipAddress: getClientIp(req.headers),
      tenantId: user.tenant_id ?? undefined,
    });

    const isSecure = process.env.NODE_ENV === "production";
    const maxAge = 7 * 24 * 60 * 60;
    const csrfToken = randomBytes(32).toString("hex");
    const tenantId = user.tenant_id ?? "*";

    const res = NextResponse.json({
      ok: true, role: user.role, tenant_id: tenantId,
      display_name: user.display_name, email: user.email,
    });

    res.cookies.set("mc_auth", sessionToken, { httpOnly: true, secure: isSecure, sameSite: "strict", maxAge, path: "/" });
    res.cookies.set("mc_csrf", csrfToken, { httpOnly: false, secure: isSecure, sameSite: "strict", maxAge, path: "/" });
    res.cookies.set("mc_role", user.role, { httpOnly: false, secure: isSecure, sameSite: "strict", maxAge, path: "/" });
    res.cookies.set("mc_tenant", tenantId, { httpOnly: false, secure: isSecure, sameSite: "strict", maxAge, path: "/" });
    res.cookies.set("mc_user_session", "1", { httpOnly: false, secure: isSecure, sameSite: "strict", maxAge, path: "/" });

    return res;
  } catch (err) {
    console.error("[auth/verify-magic-link] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
