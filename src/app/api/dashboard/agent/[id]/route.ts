import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!validateAdmin(request)) {
    return unauthorized();
  }

  try {
    const { id: agentId } = await params;

    // Agent info — explicitly exclude token_hash
    const agent = await query(
      "SELECT id, name, role, metadata, tenant_id, created_at, updated_at FROM agents WHERE id = $1",
      [agentId]
    );
    if (agent.rows.length === 0) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Recent events (last 50)
    const events = await query(`
      SELECT id, event_type, direction, session_key, channel_id, sender,
             content, content_redacted, metadata, token_estimate, created_at,
             threat_level, threat_classes
      FROM events
      WHERE agent_id = $1
      ORDER BY created_at DESC
      LIMIT 50
    `, [agentId]);

    // Active sessions
    const sessions = await query(`
      SELECT session_key, channel_id, started_at, last_active, message_count
      FROM sessions
      WHERE agent_id = $1
      ORDER BY last_active DESC
      LIMIT 20
    `, [agentId]);

    // 7-day stats
    const stats = await query(`
      SELECT day, messages_received, messages_sent, tool_calls, errors,
             estimated_tokens, estimated_cost_usd
      FROM daily_stats
      WHERE agent_id = $1 AND day > CURRENT_DATE - INTERVAL '7 days'
      ORDER BY day DESC
    `, [agentId]);

    // 30-day cost
    const costResult = await query(`
      SELECT COALESCE(SUM(estimated_cost_usd), 0)::float AS cost_30d,
             COALESCE(SUM(estimated_tokens), 0)::bigint AS tokens_30d
      FROM daily_stats
      WHERE agent_id = $1 AND day > CURRENT_DATE - INTERVAL '30 days'
    `, [agentId]);

    // Threat summary (30d)
    const threatResult = await query(`
      SELECT COUNT(*)::int AS threat_count_30d,
             COUNT(*) FILTER (WHERE threat_level IN ('high', 'critical'))::int AS severe_count_30d
      FROM events
      WHERE agent_id = $1
        AND threat_level IS NOT NULL AND threat_level != 'none'
        AND created_at > NOW() - INTERVAL '30 days'
    `, [agentId]);

    // Recent threats (last 10)
    const recentThreats = await query(`
      SELECT id, event_type, threat_level, threat_classes, created_at
      FROM events
      WHERE agent_id = $1
        AND threat_level IS NOT NULL AND threat_level != 'none'
      ORDER BY created_at DESC
      LIMIT 10
    `, [agentId]);

    // Error rate (7d)
    const errorRate = await query(`
      SELECT COALESCE(SUM(errors), 0)::int AS errors_7d,
             COALESCE(SUM(messages_received + messages_sent + tool_calls), 0)::int AS total_events_7d
      FROM daily_stats
      WHERE agent_id = $1 AND day > CURRENT_DATE - INTERVAL '7 days'
    `, [agentId]);

    // Top tools used (from events)
    const topTools = await query(`
      SELECT content AS tool_name, COUNT(*)::int AS call_count
      FROM events
      WHERE agent_id = $1
        AND event_type = 'tool_call'
        AND created_at > NOW() - INTERVAL '7 days'
      GROUP BY content
      ORDER BY call_count DESC
      LIMIT 10
    `, [agentId]);

    // Last active timestamp
    const lastActive = await query(
      "SELECT MAX(created_at) AS last_active FROM events WHERE agent_id = $1",
      [agentId]
    );

    return NextResponse.json({
      agent: agent.rows[0],
      events: events.rows,
      sessions: sessions.rows,
      stats: stats.rows,
      cost: costResult.rows[0] ?? { cost_30d: 0, tokens_30d: 0 },
      threats: {
        ...(threatResult.rows[0] ?? { threat_count_30d: 0, severe_count_30d: 0 }),
        recent: recentThreats.rows,
      },
      errorRate: errorRate.rows[0] ?? { errors_7d: 0, total_events_7d: 0 },
      topTools: topTools.rows,
      lastActive: (lastActive.rows[0] as Record<string, unknown>)?.last_active ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dashboard/agent] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
