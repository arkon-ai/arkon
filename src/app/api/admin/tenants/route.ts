import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resolveRole, unauthorized, forbidden } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) return unauthorized();
  if (role !== "owner" && role !== "admin") return forbidden("Owner or admin access required");

  try {
    const result = await query(
      `SELECT t.id, t.name, t.domain, t.plan, t.admin_email, t.setup_completed, t.created_at,
              (SELECT COUNT(*) FROM agents a WHERE a.tenant_id = t.id) as agent_count,
              (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count
       FROM tenants t ORDER BY t.created_at DESC`
    );
    return NextResponse.json({ tenants: result.rows });
  } catch (err) {
    console.error("[admin/tenants] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
