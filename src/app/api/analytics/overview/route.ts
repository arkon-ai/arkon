import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  try {
    const range = req.nextUrl.searchParams.get("range") ?? "7d";
    const agentId = req.nextUrl.searchParams.get("agent_id");

    const days = range === "30d" ? 30 : range === "24h" ? 1 : 7;
    const interval = `${days} days`;

    const agentFilter = agentId ? "AND e.agent_id = $2" : "";
    const params: (string | number)[] = [interval];
    if (agentId) params.push(agentId);

    // 1. Volume by event type
    const volumeByType = await query(
      `SELECT
        event_type,
        COUNT(*)::int as count
       FROM events e
       WHERE created_at > NOW() - $1::interval ${agentFilter}
       GROUP BY event_type
       ORDER BY count DESC`,
      params
    );

    // 2. Volume by channel
    const volumeByChannel = await query(
      `SELECT
        COALESCE(channel_id, 'unknown') as channel,
        COUNT(*)::int as count,
        COUNT(*) FILTER (WHERE direction = 'inbound')::int as inbound,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int as outbound
       FROM events e
       WHERE created_at > NOW() - $1::interval ${agentFilter}
       GROUP BY channel_id
       ORDER BY count DESC`,
      params
    );

    // 3. Hourly activity pattern (hour of day aggregated across all days)
    const hourlyPattern = await query(
      `SELECT
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as count
       FROM events e
       WHERE created_at > NOW() - $1::interval ${agentFilter}
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      params
    );

    // 4. Daily volume timeline
    const dailyVolume = await query(
      `SELECT
        DATE(created_at) as day,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE event_type = 'message_received')::int as received,
        COUNT(*) FILTER (WHERE event_type = 'message_sent')::int as sent,
        COUNT(*) FILTER (WHERE event_type = 'tool_call')::int as tool_calls,
        COUNT(*) FILTER (WHERE event_type = 'error')::int as errors
       FROM events e
       WHERE created_at > NOW() - $1::interval ${agentFilter}
       GROUP BY DATE(created_at)
       ORDER BY day`,
      params
    );

    // 5. Per-agent breakdown
    const agentBreakdown = await query(
      `SELECT
        a.name as agent_name,
        a.id as agent_id,
        COUNT(*)::int as total_events,
        COUNT(*) FILTER (WHERE e.event_type = 'message_received')::int as received,
        COUNT(*) FILTER (WHERE e.event_type = 'message_sent')::int as sent,
        COUNT(*) FILTER (WHERE e.event_type = 'tool_call')::int as tool_calls,
        COUNT(*) FILTER (WHERE e.event_type = 'error')::int as errors,
        COALESCE(SUM(e.token_estimate), 0)::bigint as total_tokens,
        MAX(e.created_at) as last_active
       FROM events e
       JOIN agents a ON a.id = e.agent_id
       WHERE e.created_at > NOW() - $1::interval ${agentFilter}
       GROUP BY a.id, a.name
       ORDER BY total_events DESC`,
      params
    );

    // 6. Session stats
    const sessionStats = await query(
      `SELECT
        COUNT(*)::int as total_sessions,
        COALESCE(AVG(message_count), 0)::int as avg_messages_per_session,
        MAX(message_count)::int as max_messages_in_session,
        COUNT(*) FILTER (WHERE last_active > NOW() - INTERVAL '1 hour')::int as active_sessions
       FROM sessions s
       ${agentId ? "WHERE s.agent_id = $2" : ""}`,
      agentId ? [interval, agentId] : []
    );

    // 7. Top senders (who messages the agents most)
    const topSenders = await query(
      `SELECT
        COALESCE(
          (metadata->>'senderName'),
          sender,
          'Unknown'
        ) as sender_name,
        channel_id as channel,
        COUNT(*)::int as message_count
       FROM events e
       WHERE event_type = 'message_received'
         AND created_at > NOW() - $1::interval ${agentFilter}
       GROUP BY COALESCE((metadata->>'senderName'), sender, 'Unknown'), channel_id
       ORDER BY message_count DESC
       LIMIT 10`,
      params
    );

    // 8. Direction ratio
    const directionRatio = await query(
      `SELECT
        COUNT(*) FILTER (WHERE direction = 'inbound')::int as inbound,
        COUNT(*) FILTER (WHERE direction = 'outbound')::int as outbound,
        COUNT(*) FILTER (WHERE direction IS NULL)::int as untagged
       FROM events e
       WHERE created_at > NOW() - $1::interval ${agentFilter}`,
      params
    );

    // 9. Tool calls (ready for when OpenClaw sends them)
    const toolCalls = await query(
      `SELECT
        tool_name,
        COUNT(*)::int as call_count,
        COALESCE(AVG(duration_ms), 0)::int as avg_duration_ms,
        COUNT(*) FILTER (WHERE result_summary LIKE '%error%' OR result_summary LIKE '%fail%')::int as failures
       FROM tool_calls
       WHERE created_at > NOW() - $1::interval
         ${agentId ? "AND agent_id = $2" : ""}
       GROUP BY tool_name
       ORDER BY call_count DESC
       LIMIT 20`,
      params
    );

    // 10. Summary totals
    const totals = await query(
      `SELECT
        COUNT(*)::int as total_events,
        COUNT(DISTINCT agent_id)::int as active_agents,
        COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL)::int as unique_sessions,
        COALESCE(SUM(token_estimate), 0)::bigint as total_tokens
       FROM events e
       WHERE created_at > NOW() - $1::interval ${agentFilter}`,
      params
    );

    return NextResponse.json({
      volumeByType: volumeByType.rows,
      volumeByChannel: volumeByChannel.rows,
      hourlyPattern: hourlyPattern.rows,
      dailyVolume: dailyVolume.rows,
      agentBreakdown: agentBreakdown.rows,
      sessionStats: sessionStats.rows[0] ?? { total_sessions: 0, avg_messages_per_session: 0, max_messages_in_session: 0, active_sessions: 0 },
      topSenders: topSenders.rows,
      directionRatio: directionRatio.rows[0] ?? { inbound: 0, outbound: 0, untagged: 0 },
      toolCalls: toolCalls.rows,
      totals: totals.rows[0] ?? { total_events: 0, active_agents: 0, unique_sessions: 0, total_tokens: 0 },
      range,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[analytics/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
