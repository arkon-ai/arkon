import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { query } from "@/lib/db";
import { forbidden, unauthorized, validateRole } from "@/app/api/tools/_utils";

// SEC-8: Two-step purge confirmation
// Step 1: POST with agent_id → returns confirmation_token (valid 60s)
// Step 2: POST with agent_id + confirmation_token → executes purge
const pendingPurges = new Map<string, { agentId: string; expiresAt: number }>();

// Cleanup expired tokens every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, entry] of pendingPurges) {
    if (now > entry.expiresAt) pendingPurges.delete(token);
  }
}, 300_000);

export async function POST(request: NextRequest) {
  try {
    // RBAC: owner + admin
    const role = await validateRole(request, "admin");
    if (!role) return unauthorized();
    void forbidden; // available for future stricter gates

    const body = await request.json();
    const { agent_id, confirmation_token } = body;

    if (!agent_id || typeof agent_id !== "string") {
      return NextResponse.json({ error: "agent_id required" }, { status: 400 });
    }

    // Step 2: Execute purge with confirmation token
    if (confirmation_token) {
      const pending = pendingPurges.get(confirmation_token);
      if (!pending || pending.agentId !== agent_id || Date.now() > pending.expiresAt) {
        return NextResponse.json(
          { error: "Invalid or expired confirmation token. Request a new one." },
          { status: 400 }
        );
      }

      // Token valid — execute purge
      pendingPurges.delete(confirmation_token);

      const toolResult = await query("DELETE FROM tool_calls WHERE agent_id = $1", [agent_id]);
      const eventResult = await query("DELETE FROM events WHERE agent_id = $1", [agent_id]);
      const sessionResult = await query("DELETE FROM sessions WHERE agent_id = $1", [agent_id]);
      const statsResult = await query("DELETE FROM daily_stats WHERE agent_id = $1", [agent_id]);

      // Audit log: record the purge as an event (using a system agent)
      await query(
        `INSERT INTO events (agent_id, session_key, event_type, content, metadata, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [
          agent_id,
          "system-audit",
          "note",
          `Data purge executed for agent ${agent_id}: ${eventResult.rowCount} events, ${sessionResult.rowCount} sessions, ${statsResult.rowCount} daily_stats, ${toolResult.rowCount} tool_calls deleted.`,
          JSON.stringify({ action: "purge", role, purged_counts: {
            events: eventResult.rowCount,
            tool_calls: toolResult.rowCount,
            sessions: sessionResult.rowCount,
            daily_stats: statsResult.rowCount,
          }}),
        ]
      );

      return NextResponse.json({
        ok: true,
        purged: {
          agent_id,
          events: eventResult.rowCount,
          tool_calls: toolResult.rowCount,
          sessions: sessionResult.rowCount,
          daily_stats: statsResult.rowCount,
        },
        timestamp: new Date().toISOString(),
      });
    }

    // Step 1: Generate confirmation token
    const token = randomBytes(16).toString("hex");
    pendingPurges.set(token, {
      agentId: agent_id,
      expiresAt: Date.now() + 60_000, // 60 seconds
    });

    return NextResponse.json({
      ok: false,
      confirmation_required: true,
      confirmation_token: token,
      expires_in_seconds: 60,
      message: `This will permanently delete ALL data for agent "${agent_id}". Send the same request with "confirmation_token" to proceed.`,
    });
  } catch (err) {
    console.error("[purge] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
