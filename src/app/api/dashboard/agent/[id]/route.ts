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
      "SELECT id, name, metadata, created_at, updated_at FROM agents WHERE id = $1",
      [agentId]
    );
    if (agent.rows.length === 0) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Recent events (last 50)
    const events = await query(`
      SELECT id, event_type, direction, session_key, channel_id, sender,
             content, content_redacted, metadata, token_estimate, created_at
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
      SELECT day, messages_received, messages_sent, tool_calls, errors, estimated_tokens
      FROM daily_stats
      WHERE agent_id = $1 AND day > CURRENT_DATE - INTERVAL '7 days'
      ORDER BY day DESC
    `, [agentId]);

    return NextResponse.json({
      agent: agent.rows[0],
      events: events.rows,
      sessions: sessions.rows,
      stats: stats.rows,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[dashboard/agent] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
