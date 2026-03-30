import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) {
    return unauthorized();
  }

  try {
    const range = req.nextUrl.searchParams.get("range") ?? "7d";
    const days = range === "30d" ? 30 : range === "24h" ? 1 : 7;
    const interval = `${days} days`;

    // 1. Summary stats
    const summary = await query(
      `SELECT
        COUNT(*)::int as total_messages,
        COUNT(*) FILTER (WHERE role = 'user')::int as user_messages,
        COUNT(*) FILTER (WHERE role = 'assistant')::int as assistant_messages,
        COUNT(*) FILTER (WHERE status = 'error')::int as errors,
        COUNT(*) FILTER (WHERE status = 'interrupted')::int as interrupted,
        COUNT(*) FILTER (WHERE status = 'sent')::int as delivered
       FROM vos_messages
       WHERE created_at > NOW() - $1::interval`,
      [interval]
    );

    // 2. Response time stats (from metadata on assistant messages)
    const responseStats = await query(
      `SELECT
        COALESCE(AVG((metadata->>'durationMs')::numeric), 0)::int as avg_duration_ms,
        COALESCE(MIN((metadata->>'durationMs')::numeric), 0)::int as min_duration_ms,
        COALESCE(MAX((metadata->>'durationMs')::numeric), 0)::int as max_duration_ms,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY (metadata->>'durationMs')::numeric), 0)::int as p95_duration_ms
       FROM vos_messages
       WHERE role = 'assistant'
         AND status = 'sent'
         AND metadata->>'durationMs' IS NOT NULL
         AND created_at > NOW() - $1::interval`,
      [interval]
    );

    // 3. Token usage (from metadata on assistant messages)
    const tokenUsage = await query(
      `SELECT
        COALESCE(SUM((metadata->'usage'->>'input')::bigint), 0)::bigint as input_tokens,
        COALESCE(SUM((metadata->'usage'->>'output')::bigint), 0)::bigint as output_tokens,
        COALESCE(SUM((metadata->'usage'->>'cacheRead')::bigint), 0)::bigint as cache_read_tokens,
        COALESCE(SUM((metadata->'usage'->>'cacheWrite')::bigint), 0)::bigint as cache_write_tokens,
        COALESCE(SUM((metadata->'usage'->>'total')::bigint), 0)::bigint as total_tokens,
        COUNT(DISTINCT metadata->>'model')::int as model_count
       FROM vos_messages
       WHERE role = 'assistant'
         AND status = 'sent'
         AND metadata->'usage' IS NOT NULL
         AND created_at > NOW() - $1::interval`,
      [interval]
    );

    // 4. Per-channel activity
    const channelActivity = await query(
      `SELECT
        c.name as channel_name,
        c.slug as channel_slug,
        COUNT(m.id)::int as message_count,
        COUNT(m.id) FILTER (WHERE m.role = 'user')::int as user_count,
        COUNT(m.id) FILTER (WHERE m.role = 'assistant' AND m.status = 'sent')::int as assistant_count,
        COUNT(m.id) FILTER (WHERE m.status = 'error')::int as error_count,
        MAX(m.created_at) as last_message_at
       FROM vos_channels c
       LEFT JOIN vos_messages m ON m.channel_id = c.id
         AND m.created_at > NOW() - $1::interval
       GROUP BY c.id, c.name, c.slug
       ORDER BY message_count DESC`,
      [interval]
    );

    // 5. Model breakdown
    const modelBreakdown = await query(
      `SELECT
        COALESCE(metadata->>'model', 'unknown') as model,
        COALESCE(metadata->>'provider', 'unknown') as provider,
        COUNT(*)::int as message_count,
        COALESCE(AVG((metadata->>'durationMs')::numeric), 0)::int as avg_duration_ms,
        COALESCE(SUM((metadata->'usage'->>'total')::bigint), 0)::bigint as total_tokens
       FROM vos_messages
       WHERE role = 'assistant'
         AND status = 'sent'
         AND metadata->>'model' IS NOT NULL
         AND created_at > NOW() - $1::interval
       GROUP BY metadata->>'model', metadata->>'provider'
       ORDER BY message_count DESC`,
      [interval]
    );

    // 6. Hourly activity pattern
    const hourlyPattern = await query(
      `SELECT
        EXTRACT(HOUR FROM created_at)::int as hour,
        COUNT(*)::int as count,
        COUNT(*) FILTER (WHERE role = 'user')::int as user_count,
        COUNT(*) FILTER (WHERE role = 'assistant')::int as assistant_count
       FROM vos_messages
       WHERE created_at > NOW() - $1::interval
       GROUP BY EXTRACT(HOUR FROM created_at)
       ORDER BY hour`,
      [interval]
    );

    // 7. Daily volume timeline
    const dailyVolume = await query(
      `SELECT
        DATE(created_at) as day,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE role = 'user')::int as user_msgs,
        COUNT(*) FILTER (WHERE role = 'assistant' AND status = 'sent')::int as assistant_msgs,
        COUNT(*) FILTER (WHERE status = 'error')::int as errors
       FROM vos_messages
       WHERE created_at > NOW() - $1::interval
       GROUP BY DATE(created_at)
       ORDER BY day`,
      [interval]
    );

    // 8. Recent messages (last 10)
    const recentMessages = await query(
      `SELECT
        m.id,
        m.role,
        LEFT(m.content, 120) as content_preview,
        m.status,
        m.metadata,
        m.created_at,
        c.name as channel_name,
        c.slug as channel_slug
       FROM vos_messages m
       JOIN vos_channels c ON c.id = m.channel_id
       ORDER BY m.created_at DESC
       LIMIT 10`
    );

    // 9. Error details (recent errors/interrupted)
    const recentErrors = await query(
      `SELECT
        m.id,
        LEFT(m.content, 200) as content_preview,
        m.status,
        m.metadata,
        m.created_at,
        c.name as channel_name
       FROM vos_messages m
       JOIN vos_channels c ON c.id = m.channel_id
       WHERE m.status IN ('error', 'interrupted')
       ORDER BY m.created_at DESC
       LIMIT 5`
    );

    return NextResponse.json({
      summary: summary.rows[0],
      responseStats: responseStats.rows[0],
      tokenUsage: tokenUsage.rows[0],
      channelActivity: channelActivity.rows,
      modelBreakdown: modelBreakdown.rows,
      hourlyPattern: hourlyPattern.rows,
      dailyVolume: dailyVolume.rows,
      recentMessages: recentMessages.rows,
      recentErrors: recentErrors.rows,
      range,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[victoryos/overview] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
