import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

/**
 * GET /api/notifications/preferences — get all notification channel preferences
 */
export async function GET() {
  const tenantId = "default";

  const result = await query(
    `SELECT channel, enabled, config FROM notification_preferences WHERE tenant_id = $1 ORDER BY channel`,
    [tenantId],
  );

  // Return a map of channel → { enabled, config }
  const channels: Record<string, { enabled: boolean; config: Record<string, unknown> }> = {};
  for (const row of result.rows) {
    channels[row.channel] = { enabled: row.enabled, config: row.config ?? {} };
  }

  return NextResponse.json({ channels });
}

/**
 * PUT /api/notifications/preferences — upsert a single channel preference
 * Body: { channel: string, enabled: boolean, config: object }
 */
export async function PUT(req: NextRequest) {
  const body = (await req.json()) as {
    channel: string;
    enabled: boolean;
    config: Record<string, unknown>;
  };
  const tenantId = "default";

  if (!body.channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  const validChannels = ["email", "slack", "telegram", "discord", "webhook"];
  if (!validChannels.includes(body.channel)) {
    return NextResponse.json({ error: `Invalid channel. Must be one of: ${validChannels.join(", ")}` }, { status: 400 });
  }

  await query(
    `INSERT INTO notification_preferences (tenant_id, channel, enabled, config, updated_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (tenant_id, channel) DO UPDATE
     SET enabled = $3, config = $4, updated_at = NOW()`,
    [tenantId, body.channel, body.enabled, JSON.stringify(body.config)],
  );

  return NextResponse.json({ ok: true });
}
