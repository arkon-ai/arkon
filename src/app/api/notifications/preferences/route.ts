import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getClientIp, logAudit } from "@/lib/audit";
import { resolveTenantAccess } from "@/lib/tenant-access";

const SECRET_KEYS = new Set([
  "bot_token",
  "webhook_url",
  "secret_value",
  "api_key",
  "token",
  "password",
]);

function redactSecrets(config: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).map(([key, value]) => [
      key,
      SECRET_KEYS.has(key.toLowerCase()) && value ? "[redacted]" : value,
    ])
  );
}

/**
 * GET /api/notifications/preferences — get all notification channel preferences
 */
export async function GET(req: NextRequest) {
  const access = await resolveTenantAccess(req, { minimumRole: "admin" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const tenantId = access.tenantId;

  const result = await query(
    `SELECT channel, enabled, config FROM notification_preferences WHERE tenant_id = $1 ORDER BY channel`,
    [tenantId],
  );

  // Return a map of channel → { enabled, config }
  const channels: Record<string, { enabled: boolean; config: Record<string, unknown> }> = {};
  for (const row of result.rows) {
    channels[row.channel] = { enabled: row.enabled, config: redactSecrets(row.config ?? {}) };
  }

  return NextResponse.json({ channels });
}

/**
 * PUT /api/notifications/preferences — upsert a single channel preference
 * Body: { channel: string, enabled: boolean, config: object }
 */
export async function PUT(req: NextRequest) {
  const access = await resolveTenantAccess(req, { minimumRole: "admin" });
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as {
    channel: string;
    enabled: boolean;
    config: Record<string, unknown>;
  };
  const tenantId = access.tenantId;

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

  logAudit({
    actorType: access.credential.type === "agent_token" ? "agent" : "user",
    actorId: access.credential.user_id?.toString() ?? access.credential.agent_id ?? access.credential.type,
    action: "notification_preferences.updated",
    targetType: "notification_preferences",
    targetId: `${tenantId}:${body.channel}`,
    description: `Updated ${body.channel} notification preferences`,
    metadata: { channel: body.channel, enabled: body.enabled },
    newValue: { enabled: body.enabled, config: redactSecrets(body.config ?? {}) },
    ipAddress: getClientIp(req.headers),
    tenantId,
  });

  return NextResponse.json({ ok: true });
}
