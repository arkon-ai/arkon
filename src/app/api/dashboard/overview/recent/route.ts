import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { unauthorized } from "@/app/api/tools/_utils";
import { resolveTenantAccess, dashboardTenantScope } from "@/lib/tenant-access";

export async function GET(req: NextRequest) {
  // Same tenant scoping as the parent overview route (WI-1846) — events carry
  // no tenant_id, so they are scoped through the agents join.
  const access = await resolveTenantAccess(req, { allowOwnerWildcard: true });
  const tenantId = access && dashboardTenantScope(access);
  if (!tenantId) {
    return unauthorized();
  }

  const scoped = tenantId !== "*";

  // Clamp both ends: an unparseable or negative limit used to reach Postgres as
  // NaN/-1 and come back a 500 (panel R1).
  const requested = parseInt(req.nextUrl.searchParams.get("limit") ?? "5", 10);
  const limit = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), 20)
    : 5;

  try {
    const result = await query(
      `SELECT e.id, a.name as agent_name, e.event_type,
              LEFT(e.content, 120) as content, e.created_at
       FROM events e
       JOIN agents a ON a.id = e.agent_id
       ${scoped ? "WHERE a.tenant_id = $2" : ""}
       ORDER BY e.created_at DESC
       LIMIT $1`,
      scoped ? [limit, tenantId] : [limit]
    );

    // Per-principal since WI-1846 — see the parent overview route.
    return NextResponse.json(
      { events: result.rows },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    console.error("[dashboard/overview/recent] Error:", err);
    // 500, not an empty feed: a swallowed error renders as "no recent activity"
    // for a tenant that is in fact busy, and fires no client error state.
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
