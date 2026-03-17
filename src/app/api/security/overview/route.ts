import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  try {
    const range = req.nextUrl.searchParams.get("range") ?? "7d";
    const severity = req.nextUrl.searchParams.get("severity");
    const threatClass = req.nextUrl.searchParams.get("class");
    const showDismissed = req.nextUrl.searchParams.get("show_dismissed") === "true";

    const days = range === "30d" ? 30 : range === "24h" ? 1 : 7;
    const interval = `${days} days`;

    // 1. Severity breakdown (all time within range)
    const severityBreakdown = await query(
      `SELECT
        threat_level,
        COUNT(*)::int as count
       FROM events
       WHERE threat_level IS NOT NULL
         AND threat_level != 'none'
         AND created_at > NOW() - $1::interval
       GROUP BY threat_level
       ORDER BY CASE threat_level
         WHEN 'critical' THEN 1
         WHEN 'high' THEN 2
         WHEN 'medium' THEN 3
         WHEN 'low' THEN 4
         ELSE 5
       END`,
      [interval]
    );

    // 2. Threat class distribution
    const classDistribution = await query(
      `SELECT
        cls as threat_class,
        COUNT(*)::int as count
       FROM events,
         LATERAL jsonb_array_elements_text(threat_classes::jsonb) AS cls
       WHERE threat_level IS NOT NULL
         AND threat_level != 'none'
         AND created_at > NOW() - $1::interval
       GROUP BY cls
       ORDER BY count DESC`,
      [interval]
    );

    // 3. Timeline — threats per day
    const timeline = await query(
      `SELECT
        DATE(created_at) as day,
        COUNT(*) FILTER (WHERE threat_level = 'critical')::int as critical,
        COUNT(*) FILTER (WHERE threat_level = 'high')::int as high,
        COUNT(*) FILTER (WHERE threat_level = 'medium')::int as medium,
        COUNT(*) FILTER (WHERE threat_level = 'low')::int as low
       FROM events
       WHERE threat_level IS NOT NULL
         AND threat_level != 'none'
         AND created_at > NOW() - $1::interval
       GROUP BY DATE(created_at)
       ORDER BY day`,
      [interval]
    );

    // 4. Recent threat events (filterable)
    let eventsQuery = `
      SELECT
        e.id, e.agent_id, a.name as agent_name,
        e.event_type, e.direction, e.channel_id, e.sender,
        e.content, e.threat_level, e.threat_classes, e.threat_matches,
        e.created_at, e.content_redacted,
        COALESCE(e.dismissed, false) as dismissed,
        e.dismissed_at, e.dismissed_by
      FROM events e
      LEFT JOIN agents a ON a.id = e.agent_id
      WHERE e.threat_level IS NOT NULL
        AND e.threat_level != 'none'
        AND e.created_at > NOW() - $1::interval
    `;
    const params: (string | number)[] = [interval];
    let paramIdx = 2;

    if (severity) {
      eventsQuery += ` AND e.threat_level = $${paramIdx}`;
      params.push(severity);
      paramIdx++;
    }

    if (threatClass) {
      eventsQuery += ` AND e.threat_classes::text LIKE $${paramIdx}`;
      params.push(`%${threatClass}%`);
      paramIdx++;
    }

    if (!showDismissed) {
      eventsQuery += ` AND COALESCE(e.dismissed, false) = false`;
    }

    eventsQuery += ` ORDER BY e.created_at DESC LIMIT 100`;

    const threatEvents = await query(eventsQuery, params);

    // 5. Top targeted agents
    const topAgents = await query(
      `SELECT
        a.name as agent_name,
        COUNT(*)::int as threat_count,
        COUNT(*) FILTER (WHERE e.threat_level IN ('high', 'critical'))::int as severe_count
       FROM events e
       JOIN agents a ON a.id = e.agent_id
       WHERE e.threat_level IS NOT NULL
         AND e.threat_level != 'none'
         AND e.created_at > NOW() - $1::interval
       GROUP BY a.name
       ORDER BY threat_count DESC
       LIMIT 10`,
      [interval]
    );

    // 6. Total event count for context (threat vs clean ratio)
    const totalEvents = await query(
      `SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE threat_level IS NOT NULL AND threat_level != 'none')::int as threats
       FROM events
       WHERE created_at > NOW() - $1::interval`,
      [interval]
    );

    return NextResponse.json({
      severityBreakdown: severityBreakdown.rows,
      classDistribution: classDistribution.rows,
      timeline: timeline.rows,
      events: threatEvents.rows,
      topAgents: topAgents.rows,
      totalEvents: totalEvents.rows[0] ?? { total: 0, threats: 0 },
      range,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[security/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
