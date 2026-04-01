import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await params;
    const body = (await req.json()) as {
      content?: string;
      update_type?: string;
      metadata?: Record<string, unknown>;
    };

    if (!body.content) {
      return NextResponse.json({ error: "content is required" }, { status: 400 });
    }

    // Verify incident exists
    const inc = await query(`SELECT id FROM incidents WHERE id = $1`, [id]);
    if (inc.rowCount === 0) {
      return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    }

    const updateType = body.update_type && ["comment", "postmortem"].includes(body.update_type)
      ? body.update_type : "comment";

    const result = await query(
      `INSERT INTO incident_updates (incident_id, update_type, content, author, metadata)
       VALUES ($1, $2, $3, 'admin', $4) RETURNING *`,
      [id, updateType, body.content, JSON.stringify(body.metadata ?? {})]
    );

    // Touch updated_at
    await query(`UPDATE incidents SET updated_at = NOW() WHERE id = $1`, [id]);

    return NextResponse.json({ update: result.rows[0], ok: true }, { status: 201 });
  } catch (err) {
    console.error("[incidents/id/updates] POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
