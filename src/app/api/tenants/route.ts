import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resolveRole, unauthorized, forbidden } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) return unauthorized();
  // Fleet-wide tenant enumeration is owner-only — a tenant-scoped 'admin' must not
  // be able to list every tenant in the fleet (WI-1346 finding #1).
  if (role !== "owner") return forbidden("Owner access required");

  try {
    const result = await query(
      `SELECT id, name FROM tenants ORDER BY name ASC`
    );
    return NextResponse.json({ tenants: result.rows });
  } catch (err) {
    console.error("[tenants] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
