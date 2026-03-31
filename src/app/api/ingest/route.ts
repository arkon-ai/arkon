import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { validateToken } from "@/lib/auth-utils";
import { redactContent } from "@/lib/redact";
import { checkRateLimit } from "@/lib/rate-limit";
import { scanEvent } from "@/lib/threat-scanner";
import { fireAlert } from "@/lib/alert-fire";
import { broadcast } from "@/lib/event-bus";
import { estimateCost } from "@/lib/pricing-cache";
import { checkBudgetThreshold } from "@/lib/budget-check";
import { getRunsByAgent, updateRunAction } from "@/lib/active-runs";

interface IngestPayload {
  event_type: "message_received" | "message_sent" | "tool_call" | "error" | "cron" | "system" | "note";
  direction?: "inbound" | "outbound";
  session_key?: string;
  channel_id?: string;
  sender?: string;
  content?: string;
  metadata?: Record<string, unknown>;
  token_estimate?: number;
  timestamp?: string;
}

const VALID_EVENT_TYPES = ["message_received", "message_sent", "tool_call", "error", "cron", "system", "note"];

export async function POST(request: NextRequest) {
  try {
    // 1. Auth
    const authHeader = request.headers.get("authorization");
    const agentId = validateToken(authHeader);
    if (!agentId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Rate limit
    const rateCheck = await checkRateLimit(agentId);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfterSeconds: 60 },
        { status: 429 }
      );
    }

    // 3. Parse body
    const body: IngestPayload = await request.json();

    // 4. Validate
    if (!body.event_type || !VALID_EVENT_TYPES.includes(body.event_type)) {
      return NextResponse.json(
        { error: "Invalid event_type. Must be one of: " + VALID_EVENT_TYPES.join(", ") },
        { status: 400 }
      );
    }

    // 5. Redact sensitive content
    const { text: safeContent, redacted } = redactContent(body.content || "");

    // 6. ThreatGuard — scan before writing to DB
    const threatResult = scanEvent(safeContent, body.event_type);

    // 7. Write to PostgreSQL (with threat columns)
    const result = await query(
      `INSERT INTO events (
        agent_id, event_type, direction, session_key, channel_id, sender,
        content, content_redacted, metadata, token_estimate, created_at,
        threat_level, threat_classes, threat_matches
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id, created_at`,
      [
        agentId,
        body.event_type,
        body.direction || null,
        body.session_key || null,
        body.channel_id || null,
        body.sender || null,
        safeContent,
        redacted,
        JSON.stringify(body.metadata || {}),
        body.token_estimate || null,
        body.timestamp ? new Date(body.timestamp) : new Date(),
        threatResult.level,
        JSON.stringify(threatResult.classes),
        JSON.stringify(threatResult.matches),
      ]
    );

    // 8. AlertFire — fire immediately for HIGH/CRITICAL (non-blocking)
    if (threatResult.level === "high" || threatResult.level === "critical") {
      const agentRow = await query("SELECT name FROM agents WHERE id = $1 LIMIT 1", [agentId]);
      const agentName = agentRow.rows[0]?.name ?? agentId;

      void fireAlert(
        {
          agentId,
          agentName,
          eventType: body.event_type,
          sessionKey: body.session_key,
          createdAt: result.rows[0].created_at,
        },
        threatResult,
      );
    }

    // 9. Update session tracking
    if (body.session_key) {
      // Look up tenant_id for this agent
      const agentRow = await query("SELECT tenant_id FROM agents WHERE id = $1 LIMIT 1", [agentId]);
      const tenantId = agentRow.rows[0]?.tenant_id ?? "transformate";

      await query(
        `INSERT INTO sessions (agent_id, session_key, channel_id, last_active, message_count, tenant_id)
         VALUES ($1, $2, $3, NOW(), 1, $4)
         ON CONFLICT (agent_id, session_key)
         DO UPDATE SET last_active = NOW(), message_count = sessions.message_count + 1`,
        [agentId, body.session_key, body.channel_id || null, tenantId]
      );
    }

    // 10. Resolve tenant for budget tracking
    const tenantRow2 = await query("SELECT tenant_id FROM agents WHERE id = $1 LIMIT 1", [agentId]);
    const resolvedTenantId = tenantRow2.rows[0]?.tenant_id ?? "transformate";

    // 10. Calculate cost (lightweight — uses in-memory pricing cache)
    const costUsd = await estimateCost(body.token_estimate || 0, body.metadata);

    // 11. Update daily stats (with cost)
    const statField = body.event_type === "message_received" ? "messages_received"
      : body.event_type === "message_sent" ? "messages_sent"
      : body.event_type === "tool_call" ? "tool_calls"
      : body.event_type === "error" ? "errors" : null;

    if (statField) {
      const agentRow = await query("SELECT tenant_id FROM agents WHERE id = $1 LIMIT 1", [agentId]);
      const tenantId = agentRow.rows[0]?.tenant_id ?? "transformate";

      await query(
        `INSERT INTO daily_stats (agent_id, day, ${statField}, estimated_tokens, estimated_cost_usd, tenant_id)
         VALUES ($1, CURRENT_DATE, 1, $2, $4, $3)
         ON CONFLICT (agent_id, day)
         DO UPDATE SET ${statField} = daily_stats.${statField} + 1,
                       estimated_tokens = daily_stats.estimated_tokens + $2,
                       estimated_cost_usd = daily_stats.estimated_cost_usd + $4`,
        [agentId, body.token_estimate || 0, tenantId, costUsd]
      );
    }

    // 13. Check budget thresholds (non-blocking)
    if (costUsd > 0) {
      void checkBudgetThreshold(agentId, resolvedTenantId);
    }

    // 14. Update active run tracker (if agent has a running session)
    const agentRuns = getRunsByAgent(agentId);
    if (agentRuns.length > 0 && safeContent) {
      const actionDesc =
        body.event_type === "tool_call"
          ? `Tool: ${safeContent.slice(0, 80)}`
          : body.event_type === "message_sent"
          ? `Sent: ${safeContent.slice(0, 80)}`
          : safeContent.slice(0, 80);
      for (const run of agentRuns) {
        updateRunAction(run.run_id, actionDesc);
      }
    }

    // 15. SSE broadcast to connected dashboard clients
    broadcast({
      type: "event",
      payload: {
        event_id: result.rows[0].id,
        agent_id: agentId,
        event_type: body.event_type,
        direction: body.direction || null,
        channel_id: body.channel_id || null,
        sender: body.sender || null,
        threat_level: threatResult.level,
        created_at: result.rows[0].created_at,
      },
    });

    return NextResponse.json({
      ok: true,
      event_id: result.rows[0].id,
      created_at: result.rows[0].created_at,
      remaining_requests: rateCheck.remaining,
      threat: threatResult.level !== "none" ? {
        level: threatResult.level,
        classes: threatResult.classes,
      } : undefined,
    });
  } catch (err) {
    console.error("[ingest] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
