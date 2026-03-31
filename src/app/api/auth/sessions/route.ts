import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { logAudit, getClientIp } from "@/lib/audit";

/**
 * GET /api/auth/sessions — List active sessions for the current user.
 * DELETE /api/auth/sessions — Revoke a specific session or all sessions.
 */

export async function GET(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await query(
    `SELECT id, ip_address, user_agent, created_at, expires_at
     FROM user_sessions
     WHERE user_id = $1 AND expires_at > NOW()
     ORDER BY created_at DESC`,
    [user.id]
  );

  // Mark which session is the current one
  const currentTokenHash = getCurrentTokenHash(req);
  const sessions = result.rows.map((row: { id: string; ip_address: string; user_agent: string; created_at: string; expires_at: string }) => ({
    ...row,
    is_current: false, // We can't reliably match without storing hash in response
  }));

  return NextResponse.json({ sessions, count: sessions.length });
}

export async function DELETE(req: NextRequest) {
  const user = await resolveUser(req);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const sessionId = searchParams.get("id");
  const all = searchParams.get("all");

  if (all === "true") {
    // Revoke all sessions except current
    const currentHash = getCurrentTokenHash(req);
    await query(
      "DELETE FROM user_sessions WHERE user_id = $1 AND token_hash != $2",
      [user.id, currentHash]
    );

    logAudit({
      actorType: "user",
      actorId: user.id.toString(),
      action: "session.revoke_all",
      description: "Revoked all other sessions",
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true, message: "All other sessions revoked" });
  }

  if (sessionId) {
    // Revoke specific session (must belong to this user)
    const result = await query(
      "DELETE FROM user_sessions WHERE id = $1 AND user_id = $2 RETURNING id",
      [sessionId, user.id]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    logAudit({
      actorType: "user",
      actorId: user.id.toString(),
      action: "session.revoked",
      targetType: "session",
      targetId: sessionId,
      ipAddress: getClientIp(req.headers),
    });

    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Provide ?id=<session_id> or ?all=true" }, { status: 400 });
}

/* ── Helpers ── */

async function resolveUser(req: NextRequest): Promise<{ id: number; role: string } | null> {
  const token = req.cookies.get("mc_auth")?.value;
  if (!token) return null;

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const result = await query(
    `SELECT u.id, u.role FROM users u
     JOIN user_sessions s ON s.user_id = u.id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()
     LIMIT 1`,
    [tokenHash]
  );

  return result.rows.length > 0 ? (result.rows[0] as { id: number; role: string }) : null;
}

function getCurrentTokenHash(req: NextRequest): string {
  const token = req.cookies.get("mc_auth")?.value ?? "";
  return createHash("sha256").update(token).digest("hex");
}
