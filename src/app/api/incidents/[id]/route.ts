import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

const VALID_TRANSITIONS: Record<string, string[]> = {
  created: ["assigned", "investigating"],
  assigned: ["investigating", "resolved"],
  investigating: ["resolved"],
  resolved: ["postmortem", "closed"],
  postmortem: ["closed"],
};

const SLA_HOURS: Record<string, number> = { P1: 1, P2: 4, P3: 24, P4: 72 };

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;

    const result = await query(`SELECT * FROM incidents WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const updates = await query(
      `SELECT * FROM incident_updates WHERE incident_id = $1 ORDER BY created_at ASC`,
      [id]
    );

    const incident = result.rows[0];
    const slaDeadline = incident.sla_deadline ? new Date(incident.sla_deadline) : null;
    const now = new Date();

    return NextResponse.json({
      incident,
      updates: updates.rows,
      sla: {
        deadline: incident.sla_deadline,
        remaining_ms: slaDeadline ? slaDeadline.getTime() - now.getTime() : null,
        breached: incident.sla_breached || (slaDeadline ? now > slaDeadline : false),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[incidents/id] GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      status?: string;
      severity?: string;
      assigned_to?: string;
      description?: string;
      title?: string;
      metadata?: Record<string, unknown>;
    };

    // Get current incident
    const current = await query(`SELECT * FROM incidents WHERE id = $1`, [id]);
    if (current.rowCount === 0) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }
    const inc = current.rows[0];

    const sets: string[] = [];
    const vals: unknown[] = [];
    let paramIdx = 1;

    // Status change with transition validation
    if (body.status && body.status !== inc.status) {
      const allowed = VALID_TRANSITIONS[inc.status as string] ?? [];
      if (!allowed.includes(body.status)) {
        return NextResponse.json(
          { error: `Cannot transition from '${inc.status}' to '${body.status}'. Allowed: ${allowed.join(", ")}` },
          { status: 400 }
        );
      }
      vals.push(body.status);
      sets.push(`status = $${paramIdx++}`);

      if (body.status === "resolved") {
        sets.push(`resolved_at = NOW()`);
        // Check SLA breach
        if (inc.sla_deadline && new Date() > new Date(inc.sla_deadline)) {
          sets.push(`sla_breached = TRUE`);
        }
      }

      await query(
        `INSERT INTO incident_updates (incident_id, update_type, author, previous_value, new_value, content)
         VALUES ($1, 'status_change', 'admin', $2, $3, $4)`,
        [id, inc.status, body.status, `Status changed from ${inc.status} to ${body.status}`]
      );
    }

    // Severity change
    if (body.severity && body.severity !== inc.severity && ["P1", "P2", "P3", "P4"].includes(body.severity)) {
      vals.push(body.severity);
      sets.push(`severity = $${paramIdx++}`);

      // Recalculate SLA if not breached
      if (!inc.sla_breached) {
        const hours = SLA_HOURS[body.severity] ?? 24;
        sets.push(`sla_deadline = created_at + ('${hours} hours')::interval`);
      }

      await query(
        `INSERT INTO incident_updates (incident_id, update_type, author, previous_value, new_value, content)
         VALUES ($1, 'severity_change', 'admin', $2, $3, $4)`,
        [id, inc.severity, body.severity, `Severity changed from ${inc.severity} to ${body.severity}`]
      );
    }

    // Assignment change
    if (body.assigned_to !== undefined && body.assigned_to !== inc.assigned_to) {
      vals.push(body.assigned_to || null);
      sets.push(`assigned_to = $${paramIdx++}`);

      await query(
        `INSERT INTO incident_updates (incident_id, update_type, author, previous_value, new_value, content)
         VALUES ($1, 'assignment', 'admin', $2, $3, $4)`,
        [id, inc.assigned_to ?? "unassigned", body.assigned_to || "unassigned",
         `Assigned to ${body.assigned_to || "unassigned"}`]
      );
    }

    // Simple field updates
    if (body.title) { vals.push(body.title); sets.push(`title = $${paramIdx++}`); }
    if (body.description !== undefined) { vals.push(body.description); sets.push(`description = $${paramIdx++}`); }
    if (body.metadata) { vals.push(JSON.stringify(body.metadata)); sets.push(`metadata = $${paramIdx++}`); }

    if (sets.length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }

    sets.push(`updated_at = NOW()`);
    vals.push(id);
    const sql = `UPDATE incidents SET ${sets.join(", ")} WHERE id = $${paramIdx} RETURNING *`;

    const result = await query(sql, vals);

    return NextResponse.json({
      incident: result.rows[0],
      ok: true,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[incidents/id] PATCH error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
