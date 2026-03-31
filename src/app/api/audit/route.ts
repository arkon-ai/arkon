import { type NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateRole, unauthorized, forbidden } from "@/app/api/tools/_utils";

export const dynamic = "force-dynamic";

/**
 * GET /api/audit — Search and filter audit log v2 entries.
 * Query params: action, actor_type, actor_id, target_type, target_id, tenant_id, from, to, limit, offset
 */
export async function GET(req: NextRequest) {
  const role = await validateRole(req, "admin");
  if (!role) return unauthorized();

  const params = req.nextUrl.searchParams;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIdx = 0;

  function addFilter(col: string, param: string) {
    const val = params.get(param);
    if (val) {
      paramIdx++;
      conditions.push(`${col} = $${paramIdx}`);
      values.push(val);
    }
  }

  addFilter("action", "action");
  addFilter("actor_type", "actor_type");
  addFilter("actor_id", "actor_id");
  addFilter("target_type", "target_type");
  addFilter("target_id", "target_id");
  addFilter("tenant_id", "tenant_id");

  const from = params.get("from");
  if (from) {
    paramIdx++;
    conditions.push(`created_at >= $${paramIdx}`);
    values.push(from);
  }

  const to = params.get("to");
  if (to) {
    paramIdx++;
    conditions.push(`created_at <= $${paramIdx}`);
    values.push(to);
  }

  const search = params.get("q");
  if (search) {
    paramIdx++;
    conditions.push(`(description ILIKE $${paramIdx} OR action ILIKE $${paramIdx})`);
    values.push(`%${search}%`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const limit = Math.min(parseInt(params.get("limit") ?? "100", 10), 500);
  const offset = parseInt(params.get("offset") ?? "0", 10);

  paramIdx++;
  const limitParam = paramIdx;
  values.push(limit);

  paramIdx++;
  const offsetParam = paramIdx;
  values.push(offset);

  const sql = `
    SELECT id, actor_type, actor_id, action, target_type, target_id,
           description, metadata, old_value, new_value, ip_address, tenant_id, created_at
    FROM audit_log_v2
    ${where}
    ORDER BY created_at DESC
    LIMIT $${limitParam} OFFSET $${offsetParam}
  `;

  const countSql = `SELECT COUNT(*)::int as total FROM audit_log_v2 ${where}`;

  try {
    const [data, countResult] = await Promise.all([
      query(sql, values),
      query(countSql, values.slice(0, -2)), // exclude limit/offset
    ]);

    const format = params.get("format");

    if (format === "csv") {
      const rows = data.rows as Record<string, unknown>[];
      const headers = ["id", "actor_type", "actor_id", "action", "target_type", "target_id", "description", "ip_address", "tenant_id", "created_at"];
      const csv = [
        headers.join(","),
        ...rows.map((r) => headers.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(",")),
      ].join("\n");

      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      entries: data.rows,
      total: (countResult.rows[0] as { total: number }).total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[audit] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
