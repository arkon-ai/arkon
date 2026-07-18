import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getClientIp, logAudit } from "@/lib/audit";
import { resolveTenantAccess } from "@/lib/tenant-access";
import { resolveRequestCredential } from "@/lib/request-auth";

/**
 * POST /api/notifications/test — send a test notification to a specific channel
 * Body: { channel: string }
 * Tests the channel configuration by sending a test message.
 */
export async function POST(req: NextRequest) {
  // WI-1849: 401/403 split + owner-wildcard 'default' fallback (see preferences).
  const credential = await resolveRequestCredential(req);
  if (!credential) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await resolveTenantAccess(req, { minimumRole: "admin" });
  const tenantId = access?.tenantId ?? (credential.role === "owner" ? "default" : null);
  if (!tenantId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json()) as { channel: string };

  if (!body.channel) {
    return NextResponse.json({ error: "channel is required" }, { status: 400 });
  }

  // Get channel config
  const result = await query(
    `SELECT enabled, config FROM notification_preferences WHERE tenant_id = $1 AND channel = $2`,
    [tenantId, body.channel],
  );

  if (result.rows.length === 0) {
    return NextResponse.json({ error: "Channel not configured" }, { status: 404 });
  }

  const { config } = result.rows[0];
  const testMessage = `🔔 Arkon Test Notification — This confirms your ${body.channel} integration is working correctly.`;

  try {
    switch (body.channel) {
      case "telegram": {
        const botToken = config.bot_token;
        const chatId = config.chat_id;
        if (!botToken || !chatId) {
          return NextResponse.json({ error: "Bot token and chat ID are required" }, { status: 400 });
        }
        const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: testMessage }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          const err = await res.text();
          return NextResponse.json({ error: `Telegram API error: ${err}` }, { status: 502 });
        }
        break;
      }

      case "slack": {
        const webhookUrl = config.webhook_url;
        if (!webhookUrl) {
          return NextResponse.json({ error: "Slack webhook URL is required" }, { status: 400 });
        }
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: testMessage }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: "Slack webhook failed" }, { status: 502 });
        }
        break;
      }

      case "discord": {
        const webhookUrl = config.webhook_url;
        if (!webhookUrl) {
          return NextResponse.json({ error: "Discord webhook URL is required" }, { status: 400 });
        }
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: testMessage }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: "Discord webhook failed" }, { status: 502 });
        }
        break;
      }

      case "webhook": {
        const webhookUrl = config.url;
        if (!webhookUrl) {
          return NextResponse.json({ error: "Webhook URL is required" }, { status: 400 });
        }
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (config.secret_header && config.secret_value) {
          headers[config.secret_header as string] = config.secret_value as string;
        }
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers,
          body: JSON.stringify({
            type: "test",
            title: "Arkon Test Notification",
            body: testMessage,
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) {
          return NextResponse.json({ error: `Webhook returned ${res.status}` }, { status: 502 });
        }
        break;
      }

      case "email": {
        // Email sending would require SMTP config — just validate config for now
        if (!config.email) {
          return NextResponse.json({ error: "Email address is required" }, { status: 400 });
        }
        return NextResponse.json({
          ok: true,
          message: "Email configuration saved. SMTP integration coming soon.",
        });
      }

      default:
        return NextResponse.json({ error: "Unknown channel" }, { status: 400 });
    }

    logAudit({
      actorType: credential.type === "agent_token" ? "agent" : "user",
      actorId: credential.user_id?.toString() ?? credential.agent_id ?? credential.type,
      action: "notification_preferences.test_sent",
      targetType: "notification_preferences",
      targetId: `${tenantId}:${body.channel}`,
      description: `Sent test ${body.channel} notification`,
      metadata: { channel: body.channel },
      ipAddress: getClientIp(req.headers),
      tenantId,
    });

    return NextResponse.json({ ok: true, message: `Test ${body.channel} notification sent successfully` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: `Failed to send: ${msg}` }, { status: 502 });
  }
}
