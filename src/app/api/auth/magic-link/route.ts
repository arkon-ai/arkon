import { type NextRequest, NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { query } from "@/lib/db";
import { logAudit, getClientIp } from "@/lib/audit";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { email?: string };
    const email = body.email?.toLowerCase().trim();

    if (!email) {
      return NextResponse.json({ error: "Email required" }, { status: 400 });
    }

    const userResult = await query(
      "SELECT id, email, role, tenant_id, is_active FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0 || !(userResult.rows[0] as { is_active: boolean }).is_active) {
      await new Promise((r) => setTimeout(r, 100));
      return NextResponse.json({
        ok: true,
        message: "If an account exists for this email, a login link has been sent.",
      });
    }

    await query(
      "DELETE FROM magic_link_tokens WHERE email = $1 OR expires_at < NOW()",
      [email]
    );

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    await query(
      "INSERT INTO magic_link_tokens (email, token_hash, expires_at) VALUES ($1, $2, $3)",
      [email, tokenHash, expiresAt.toISOString()]
    );

    const allowDebugMagicLink =
      process.env.NODE_ENV !== "production" &&
      process.env.ARKON_ALLOW_MAGIC_LINK_DEBUG_URL === "true";
    const magicUrl = allowDebugMagicLink
      ? `${process.env.ARKON_BASE_URL || process.env.NEXTAUTH_URL || "https://arkonhq.com"}/login?magic=${rawToken}&email=${encodeURIComponent(email)}`
      : null;

    logAudit({
      actorType: "system",
      action: "auth.magic_link_requested",
      description: `Magic link requested for ${email}`,
      ipAddress: getClientIp(req.headers),
    });

    if (allowDebugMagicLink) {
      console.warn(`[auth/magic-link] Debug URL response enabled for ${email}`);
    }

    return NextResponse.json({
      ok: true,
      message: "If an account exists for this email, a login link has been sent.",
      ...(magicUrl ? { _debug_url: magicUrl } : {}),
    });
  } catch (err) {
    console.error("[auth/magic-link] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
