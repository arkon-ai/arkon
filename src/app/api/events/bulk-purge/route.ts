// POST /api/events/bulk-purge — Purge multiple threat events at once
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";
import { createHash } from "crypto";

export async function POST(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const body = await req.json() as { event_ids: string[] };

    if (!Array.isArray(body.event_ids) || body.event_ids.length === 0) {
      return NextResponse.json({ error: "event_ids array is required" }, { status: 400 });
    }

    if (body.event_ids.length > 100) {
      return NextResponse.json({ error: "Maximum 100 events per bulk purge" }, { status: 400 });
    }

    const ids = body.event_ids;
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(",");

    // Fetch events before deleting (for audit)
    const eventsResult = await query(
      `SELECT e.id, e.agent_id, e.event_type, e.content, e.threat_level, e.threat_classes,
              a.name AS agent_name, a.tenant_id
       FROM events e
       LEFT JOIN agents a ON a.id = e.agent_id
       WHERE e.id IN (${placeholders})`,
      ids
    );

    const events = eventsResult.rows as Array<Record<string, unknown>>;
    const foundIds = events.map((e) => String(e.id));
    const notFoundIds = ids.filter((id) => !foundIds.includes(id));

    if (foundIds.length === 0) {
      return NextResponse.json({ error: "No matching events found" }, { status: 404 });
    }

    // Delete all found events
    const deletePlaceholders = foundIds.map((_, i) => `$${i + 1}`).join(",");
    await query(`DELETE FROM events WHERE id IN (${deletePlaceholders})`, foundIds);

    // Determine tenant for audit (use first event's tenant)
    const tenantId = (events[0]?.tenant_id as string) ?? "default";

    // Log bulk purge to audit trail
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        "event.bulk_purge",
        "event",
        null,
        JSON.stringify({
          purged_count: foundIds.length,
          not_found_count: notFoundIds.length,
          events: events.map((e) => ({
            id: e.id,
            agent_name: e.agent_name ?? e.agent_id,
            threat_level: e.threat_level,
            content_hash: createHash("sha256")
              .update(String(e.content ?? ""))
              .digest("hex")
              .slice(0, 16),
          })),
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );

    return NextResponse.json({
      ok: true,
      purged_count: foundIds.length,
      not_found_count: notFoundIds.length,
      not_found_ids: notFoundIds.length > 0 ? notFoundIds : undefined,
    });
  } catch (error) {
    console.error("[events/bulk-purge] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
