import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

const SLA_HOURS: Record<string, number> = { P1: 1, P2: 4, P3: 24, P4: 72 };

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const sp = req.nextUrl.searchParams;
    const status = sp.get("status");
    const severity = sp.get("severity");
    const tenantId = sp.get("tenant_id") ?? "transformate";
    const limit = Math.min(parseInt(sp.get("limit") ?? "50", 10), 200);
    const offset = parseInt(sp.get("offset") ?? "0", 10);

    let sql = `SELECT i.*, 
      (SELECT COUNT(*)::int FROM incident_updates iu WHERE iu.incident_id = i.id) as update_count
      FROM incidents i WHERE i.tenant_id = $1`;
    const params: unknown[] = [tenantId];

    if (status && status !== "all") {
      params.push(status);
      sql += ` AND i.status = $${params.length}`;
    }
    if (severity) {
      params.push(severity);
      sql += ` AND i.severity = $${params.length}`;
    }

    sql += ` ORDER BY CASE i.severity WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 WHEN 'P3' THEN 3 ELSE 4 END, i.created_at DESC`;
    params.push(limit, offset);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

    const result = await query(sql, params);

    // Stats
    const stats = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int as open_count,
        COUNT(*) FILTER (WHERE severity IN ('P1','P2') AND status NOT IN ('resolved','closed'))::int as critical_count,
        COUNT(*) FILTER (WHERE sla_breached = TRUE)::int as sla_breaches,
        ROUND(AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/3600) FILTER (WHERE resolved_at IS NOT NULL), 1) as avg_resolution_hours
      FROM incidents WHERE tenant_id = $1`,
      [tenantId]
    );

    return NextResponse.json({
      incidents: result.rows,
      stats: stats.rows[0] ?? {},
      count: result.rowCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[incidents] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = (await req.json()) as {
      title?: string;
      description?: string;
      severity?: string;
      assigned_to?: string;
      source_type?: string;
      source_id?: string;
      tenant_id?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const severity = body.severity && ["P1", "P2", "P3", "P4"].includes(body.severity) ? body.severity : "P3";
    const tenantId = body.tenant_id ?? "transformate";
    const slaHours = SLA_HOURS[severity] ?? 24;
    const status = body.assigned_to ? "assigned" : "created";

    const result = await query(
      `INSERT INTO incidents (tenant_id, title, description, severity, status, assigned_to, created_by, source_type, source_id, sla_deadline, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'admin', $7, $8, NOW() + ($9 || ' hours')::interval, $10)
       RETURNING *`,
      [tenantId, body.title, body.description ?? null, severity, status, body.assigned_to ?? null,
       body.source_type ?? null, body.source_id ?? null, String(slaHours), JSON.stringify(body.metadata ?? {})]
    );

    const incident = result.rows[0];

    // Initial timeline entry
    await query(
      `INSERT INTO incident_updates (incident_id, update_type, content, author, new_value)
       VALUES ($1, 'status_change', 'Incident created', 'admin', $2)`,
      [incident.id, status]
    );

    return NextResponse.json({ incident, ok: true }, { status: 201 });
  } catch (err) {
    console.error("[incidents] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
