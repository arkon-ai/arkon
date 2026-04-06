import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resolveRole, unauthorized, forbidden } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  const role = await resolveRole(req);
  if (!role) return unauthorized();
  if (role !== "owner" && role !== "admin") return forbidden("Owner or admin access required");

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
