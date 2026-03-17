// src/app/api/compliance/audit-log/route.ts — Audit trail log viewer
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized, parseInteger } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const url = new URL(req.url);
  const limit = parseInteger(url.searchParams.get("limit"), 50);
  const offset = parseInteger(url.searchParams.get("offset"), 0);
  const actor = url.searchParams.get("actor");
  const action = url.searchParams.get("action");
  const resourceType = url.searchParams.get("resource_type");
  const since = url.searchParams.get("since");
  const tenantId = url.searchParams.get("tenant_id");

  try {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (tenantId) { conditions.push(`tenant_id = $${idx++}`); params.push(tenantId); }
    if (actor) { conditions.push(`actor ILIKE $${idx++}`); params.push(`%${actor}%`); }
    if (action) { conditions.push(`action = $${idx++}`); params.push(action); }
    if (resourceType) { conditions.push(`resource_type = $${idx++}`); params.push(resourceType); }
    if (since) { conditions.push(`created_at >= $${idx++}`); params.push(since); }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const countResult = await query(
      `SELECT COUNT(*)::int as total FROM audit_log ${where}`,
      params
    );

    params.push(limit, offset);
    const rows = await query(
      `SELECT id, actor, action, resource_type, resource_id, detail, ip_address, tenant_id, created_at
       FROM audit_log ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );

    // Distinct actions and resource types for filters
    const actions = await query(
      `SELECT DISTINCT action FROM audit_log ORDER BY action`
    );
    const resourceTypes = await query(
      `SELECT DISTINCT resource_type FROM audit_log ORDER BY resource_type`
    );

    return NextResponse.json({
      entries: rows.rows,
      total: countResult.rows[0]?.total ?? 0,
      limit,
      offset,
      filters: {
        actions: actions.rows.map((r: Record<string, string>) => r.action),
        resourceTypes: resourceTypes.rows.map((r: Record<string, string>) => r.resource_type),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[compliance/audit-log] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST: Record an audit log entry
export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = (await req.json()) as {
      actor: string;
      action: string;
      resource_type: string;
      resource_id?: string;
      detail?: Record<string, unknown>;
      ip_address?: string;
      tenant_id?: string;
    };

    if (!body.actor || !body.action || !body.resource_type) {
      return NextResponse.json(
        { error: "actor, action, and resource_type are required" },
        { status: 400 }
      );
    }

    const result = await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [
        body.actor,
        body.action,
        body.resource_type,
        body.resource_id ?? null,
        JSON.stringify(body.detail ?? {}),
        body.ip_address ?? req.headers.get("x-forwarded-for") ?? null,
        body.tenant_id ?? "transformate",
      ]
    );

    return NextResponse.json({ entry: result.rows[0], ok: true }, { status: 201 });
  } catch (err) {
    console.error("[compliance/audit-log] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
