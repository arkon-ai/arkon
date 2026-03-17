// POST /api/events/:id/dismiss — Mark a threat event as false positive
import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(req: NextRequest, context: RouteContext) {
  if (!validateAdmin(req)) return unauthorized();

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({})) as { dismissed?: boolean };
    const dismissed = body.dismissed !== false; // default true

    // Check event exists
    const eventResult = await query(
      `SELECT e.id, e.agent_id, e.threat_level, e.threat_classes, e.threat_matches, e.dismissed,
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

    // Update dismissed status
    await query(
      `UPDATE events SET dismissed = $2, dismissed_at = $3, dismissed_by = $4 WHERE id = $1`,
      [id, dismissed, dismissed ? new Date().toISOString() : null, dismissed ? "admin" : null]
    );

    // Log to audit trail
    await query(
      `INSERT INTO audit_log (actor, action, resource_type, resource_id, detail, ip_address, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        "admin",
        dismissed ? "event.dismiss" : "event.undismiss",
        "event",
        id,
        JSON.stringify({
          agent_id: event.agent_id,
          agent_name: event.agent_name ?? event.agent_id,
          threat_level: event.threat_level,
          threat_classes: event.threat_classes,
        }),
        req.headers.get("x-forwarded-for") ?? null,
        tenantId,
      ]
    );

    // Check dismissal frequency for this pattern (suggest rule adjustment)
    let suggestion: string | null = null;
    if (dismissed) {
      const threatMatches = event.threat_matches;
      let matches: Array<{ pattern: string }> = [];
      if (typeof threatMatches === "string") {
        try { matches = JSON.parse(threatMatches); } catch { /* ignore */ }
      } else if (Array.isArray(threatMatches)) {
        matches = threatMatches as Array<{ pattern: string }>;
      }

      if (matches.length > 0) {
        const firstPattern = matches[0].pattern;
        const dismissCount = await query(
          `SELECT COUNT(*)::int AS cnt FROM events
           WHERE dismissed = true
             AND threat_matches::text ILIKE $1
             AND agent_id IN (SELECT id FROM agents WHERE tenant_id = $2)`,
          [`%${firstPattern}%`, tenantId]
        );
        const cnt = (dismissCount.rows[0] as { cnt: number })?.cnt ?? 0;
        if (cnt >= 5) {
          suggestion = `The pattern "${firstPattern}" has been dismissed ${cnt} times. Consider adjusting this rule.`;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dismissed,
      event_id: id,
      suggestion,
    });
  } catch (error) {
    console.error("[events/:id/dismiss] POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
