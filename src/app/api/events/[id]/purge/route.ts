// POST /api/events/:id/purge — Delete a threat event from Arkon DB
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { createHash } from "crypto";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;

    // Fetch the event before deleting (for audit trail)
    const eventResult = await query(
      `SELECT e.id, e.agent_id, e.event_type, e.content, e.channel_id, e.sender,
              e.threat_level, e.threat_classes, e.created_at, e.metadata,
              a.name AS agent_name, a.tenant_id
       FROM events e
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE e.id = $1`,
      [id]
    );

    if (!eventResult.rows[0]) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    const event = eventResult.rows[0] as Record<string, unknown>;
    const tenantId = (event.tenant_id as string) ?? "default";

    // Hash the content for audit (don't store the actual sensitive content)
    const contentHash = createHash("sha256")
      .update(String(event.content ?? ""))
      .digest("hex")
      .slice(0, 16);

    // Delete the event
    await query("DELETE FROM events WHERE id = $1", [id]);

    // Log to audit trail
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        "event.purge",
        "event",
        id,
        JSON.stringify({
          agent_id: event.agent_id,
          agent_name: event.agent_name ?? event.agent_id,
          event_type: event.event_type,
          threat_level: event.threat_level,
          threat_classes: event.threat_classes,
          channel_id: event.channel_id,
          content_hash: contentHash,
          created_at: event.created_at,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );

    return NextResponse.json({
      ok: true,
      purged_from_arkon: true,
      event_id: id,
      agent_name: event.agent_name ?? event.agent_id,
      threat_level: event.threat_level,
    });
  } catch (error) {
    console.error("[events/:id/purge] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
