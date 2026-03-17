import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateAdmin, unauthorized } from "@/app/api/tools/_utils";

/**
 * GET /api/mcp/gateway/stats
 * MCP Gateway proxy traffic statistics.
 * Query: ?range=1h|24h|7d|30d (default 24h)
 */
export async function GET(req: NextRequest) {
  if (!validateAdmin(req)) return unauthorized();

  const range = req.nextUrl.searchParams.get("range") || "24h";
  const interval = range === "1h" ? "1 hour" : range === "7d" ? "7 days" : range === "30d" ? "30 days" : "24 hours";

  try {
    // Summary
    const summary = await query(
      `SELECT COUNT(*) as total_requests,
              COUNT(CASE WHEN status >= 200 AND status < 300 THEN 1 END) as success_count,
              COUNT(CASE WHEN status >= 400 THEN 1 END) as error_count,
              COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
              COALESCE(SUM(request_size + response_size), 0) as total_bytes,
              COUNT(DISTINCT server_id) as active_servers,
              COUNT(DISTINCT mcp_method) as unique_methods
       FROM mcp_proxy_logs WHERE created_at > NOW() - $1::interval`,
      [interval]
    );

    // By server
    const byServer = await query(
      `SELECT server_name, server_id,
              COUNT(*) as requests,
              COUNT(CASE WHEN status >= 200 AND status < 300 THEN 1 END) as successes,
              COUNT(CASE WHEN status >= 400 THEN 1 END) as errors,
              ROUND(AVG(duration_ms))::int as avg_ms
       FROM mcp_proxy_logs WHERE created_at > NOW() - $1::interval
       GROUP BY server_name, server_id ORDER BY requests DESC LIMIT 20`,
      [interval]
    );

    // By method
    const byMethod = await query(
      `SELECT mcp_method, COUNT(*) as count,
              ROUND(AVG(duration_ms))::int as avg_ms
       FROM mcp_proxy_logs WHERE created_at > NOW() - $1::interval AND mcp_method IS NOT NULL
       GROUP BY mcp_method ORDER BY count DESC LIMIT 20`,
      [interval]
    );

    // Recent errors
    const recentErrors = await query(
      `SELECT server_name, mcp_method, status, error, duration_ms, created_at
       FROM mcp_proxy_logs WHERE created_at > NOW() - $1::interval AND (status >= 400 OR error IS NOT NULL)
       ORDER BY created_at DESC LIMIT 10`,
      [interval]
    );

    // Hourly trend (last 24h or capped)
    const trend = await query(
      `SELECT date_trunc('hour', created_at) as hour,
              COUNT(*) as requests,
              COUNT(CASE WHEN status >= 400 THEN 1 END) as errors
       FROM mcp_proxy_logs WHERE created_at > NOW() - $1::interval
       GROUP BY hour ORDER BY hour`,
      [interval]
    );

    const row = summary.rows[0] as Record<string, string>;

    return NextResponse.json({
      range,
      summary: {
        total_requests: parseInt(row.total_requests || "0"),
        success_count: parseInt(row.success_count || "0"),
        error_count: parseInt(row.error_count || "0"),
        avg_duration_ms: Math.round(parseFloat(row.avg_duration_ms || "0")),
        total_bytes: parseInt(row.total_bytes || "0"),
        active_servers: parseInt(row.active_servers || "0"),
        unique_methods: parseInt(row.unique_methods || "0"),
      },
      by_server: byServer.rows,
      by_method: byMethod.rows,
      recent_errors: recentErrors.rows,
      hourly_trend: trend.rows,
    });
  } catch (err) {
    console.error("[mcp/gateway/stats] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
