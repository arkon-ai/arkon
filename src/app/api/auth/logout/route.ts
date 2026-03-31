import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * POST /api/auth/logout — Destroy the current session and clear cookies.
 */
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get("mc_auth")?.value;

    if (token) {
      const tokenHash = createHash("sha256").update(token).digest("hex");

      // Try to delete from user_sessions (email/password login)
      const result = await query(
        `DELETE FROM user_sessions WHERE token_hash = $1
         RETURNING user_id`,
        [tokenHash]
      );

      if (result.rows.length > 0) {
        logAudit({
          actorType: "user",
          actorId: result.rows[0].user_id.toString(),
          action: "user.logout",
          ipAddress: getClientIp(req.headers),
        });
      }
    }

    const res = NextResponse.json({ ok: true });
    const isSecure = process.env.NODE_ENV === "production";

    // Clear all auth cookies
    for (const name of ["mc_auth", "mc_csrf", "mc_role", "mc_tenant", "mc_user_session"]) {
      res.cookies.set(name, "", {
        httpOnly: name === "mc_auth",
        secure: isSecure,
        sameSite: "strict",
        maxAge: 0,
        path: "/",
      });
    }

    return res;
  } catch (err) {
    console.error("[auth/logout] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
