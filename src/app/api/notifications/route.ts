import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resolveRequestCredential, csrfValidForCookieAuth } from "@/lib/request-auth";

/**
 * GET /api/notifications — list notifications for the tenant
 * Query params: unread_only (bool), limit (int), offset (int)
 */
export async function GET(req: NextRequest) {
  // WI-1849: any valid credential may read; no credential -> 401 exactly.
  const credential = await resolveRequestCredential(req);
  if (!credential) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const unreadOnly = sp.get("unread_only") === "true";
  const limit = Math.min(parseInt(sp.get("limit") ?? "20", 10), 100);
  const offset = parseInt(sp.get("offset") ?? "0", 10);
  const tenantId = "default";

  const where = unreadOnly ? "AND read = FALSE" : "";
  const result = await query(
    `SELECT id, type, severity, title, body, link, metadata, read, created_at
     FROM notifications
     WHERE tenant_id = $1 ${where}
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [tenantId, limit, offset],
  );

  const countResult = await query(
    `SELECT COUNT(*) as total FROM notifications WHERE tenant_id = $1 AND read = FALSE`,
    [tenantId],
  );

  return NextResponse.json({
    notifications: result.rows,
    unread_count: parseInt(countResult.rows[0]?.total ?? "0", 10),
  });
}

/**
 * PATCH /api/notifications — mark notifications as read
 * Body: { ids: number[] } or { all: true }
 */
export async function PATCH(req: NextRequest) {
  // WI-1849: auth (401) then CSRF for cookie sessions (403), before any parse.
  const credential = await resolveRequestCredential(req);
  if (!credential) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!csrfValidForCookieAuth(req)) {
    return NextResponse.json({ error: "CSRF token missing or invalid" }, { status: 403 });
  }

  const body = (await req.json()) as { ids?: number[]; all?: boolean };
  const tenantId = "default";

  if (body.all) {
    await query(
      `UPDATE notifications SET read = TRUE WHERE tenant_id = $1 AND read = FALSE`,
      [tenantId],
    );
  } else if (body.ids && body.ids.length > 0) {
    const placeholders = body.ids.map((_, i) => `$${i + 2}`).join(", ");
    await query(
      `UPDATE notifications SET read = TRUE WHERE tenant_id = $1 AND id IN (${placeholders})`,
      [tenantId, ...body.ids],
    );
  }

  return NextResponse.json({ ok: true });
}
