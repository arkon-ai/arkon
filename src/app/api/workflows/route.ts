// src/app/api/workflows/route.ts — List + Create workflows
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized, resolveUser } from "@/app/api/tools/_utils";
import { logAudit, getClientIp } from "@/lib/audit";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const status = req.nextUrl.searchParams.get("status");
    const tenantId = req.nextUrl.searchParams.get("tenant_id") ?? "transformate";

    let sql = `
      SELECT id, name, description, status, trigger_type, trigger_config, created_by,
             tenant_id, last_run_at, run_count, created_at, updated_at,
             (SELECT COUNT(*)::int FROM workflow_runs wr WHERE wr.workflow_id = w.id) as total_runs,
             (SELECT COUNT(*)::int FROM workflow_runs wr WHERE wr.workflow_id = w.id AND wr.status = 'failed') as failed_runs
      FROM workflows w
      WHERE tenant_id = $1
    `;
    const params: unknown[] = [tenantId];

    if (status && status !== "all") {
      params.push(status);
      sql += ` AND status = $${params.length}`;
    }

    sql += ` ORDER BY updated_at DESC`;

    const result = await query(sql, params);

    return NextResponse.json({
      workflows: result.rows,
      count: result.rowCount,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[workflows] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = (await req.json()) as {
      name?: string;
      description?: string;
      definition?: Record<string, unknown>;
      status?: string;
      trigger_type?: string;
      trigger_config?: Record<string, unknown>;
      created_by?: string;
      tenant_id?: string;
    };

    if (!body.name) {
      return NextResponse.json({ error: "name is required" }, { status: 400 });
    }

    const result = await query(
      `INSERT INTO workflows (name, description, definition, status, trigger_type, trigger_config, created_by, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        body.name,
        body.description ?? null,
        JSON.stringify(body.definition ?? { nodes: [], edges: [] }),
        body.status ?? "draft",
        body.trigger_type ?? "manual",
        body.trigger_config ? JSON.stringify(body.trigger_config) : null,
        body.created_by ?? null,
        body.tenant_id ?? "transformate",
      ]
    );

    const workflow = result.rows[0] as { id: number; name: string };
    const user = await resolveUser(req);

    logAudit({
      actorType: user ? "user" : "system",
      actorId: user?.email ?? "owner",
      action: "workflow.created",
      targetType: "workflow",
      targetId: workflow.id.toString(),
      description: `Created workflow "${body.name}"`,
      newValue: { name: body.name, status: body.status ?? "draft", trigger_type: body.trigger_type ?? "manual" },
      ipAddress: getClientIp(req.headers),
      tenantId: body.tenant_id ?? "transformate",
    });

    return NextResponse.json({ workflow: result.rows[0], ok: true }, { status: 201 });
  } catch (err) {
    console.error("[workflows] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
