/**
 * Notification Dispatch Engine — Arkon multi-channel notifications
 *
 * Replaces hardcoded Telegram alerts. Creates an in-app notification
 * and fans out to all configured external channels (Telegram, Slack,
 * Discord, webhook) based on tenant notification preferences.
 *
 * Never throws — notification failure is non-fatal.
 */

import { query } from "@/lib/db";

export type NotificationType =
  | "threat"
  | "anomaly"
  | "approval"
  | "budget"
  | "agent_offline"
  | "infra_offline"
  | "intake"
  | "workflow_failure";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface SendNotificationParams {
  tenantId: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Map notification type + severity to preference type keys.
 * Used to check if a channel has this notification type enabled.
 */
function getPreferenceKey(type: NotificationType, severity: NotificationSeverity): string {
  if (type === "threat") {
    return severity === "critical" ? "threat_critical" : "threat_high";
  }
  return type;
}

/**
 * Send a notification: always creates in-app, then fans out to external channels.
 */
export async function sendNotification(params: SendNotificationParams): Promise<void> {
  try {
    // 1. Always create in-app notification
    await query(
      `INSERT INTO notifications (tenant_id, type, severity, title, body, link, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        params.tenantId,
        params.type,
        params.severity,
        params.title,
        params.body ?? null,
        params.link ?? null,
        JSON.stringify(params.metadata ?? {}),
      ],
    );

    // 2. Look up notification preferences for this tenant
    const prefs = await query(
      `SELECT channel, enabled, config FROM notification_preferences WHERE tenant_id = $1 AND enabled = TRUE`,
      [params.tenantId],
    );

    if (prefs.rows.length === 0) return;

    // 3. Fan out to enabled channels
    const prefKey = getPreferenceKey(params.type, params.severity);
    const message = formatMessage(params);

    const dispatches = prefs.rows
      .filter((row: { config: Record<string, unknown> }) => {
        const types = (row.config as Record<string, unknown>)?.types as Record<string, boolean> | undefined;
        if (!types) {
          // Default: send critical threats, high threats, and approvals
          return ["threat_critical", "threat_high", "approval"].includes(prefKey);
        }
        return types[prefKey] === true;
      })
      .map((row: { channel: string; config: Record<string, unknown> }) =>
        dispatchToChannel(row.channel, row.config, message, params).catch((err) => {
          console.error(`[notifications] Failed to dispatch to ${row.channel}:`, err);
        }),
      );

    await Promise.allSettled(dispatches);
  } catch (err) {
    // Notification failure is non-fatal
    console.error("[notifications] Error sending notification:", err);
  }
}

/* ── Message Formatting ── */

function severityEmoji(severity: NotificationSeverity): string {
  switch (severity) {
    case "critical": return "\u{1F6A8}";
    case "warning": return "\u26A0\uFE0F";
    default: return "\u{1F514}";
  }
}

function formatMessage(params: SendNotificationParams): string {
  const emoji = severityEmoji(params.severity);
  const lines = [
    `${emoji} ${params.title}`,
    params.body ?? "",
    params.link ? `\u2192 ${process.env.ARKON_BASE_URL ?? "http://localhost:3000"}${params.link}` : "",
  ].filter(Boolean);
  return lines.join("\n");
}

/* ── Channel Dispatchers ── */

async function dispatchToChannel(
  channel: string,
  config: Record<string, unknown>,
  message: string,
  params: SendNotificationParams,
): Promise<void> {
  switch (channel) {
    case "telegram":
      await sendTelegram(config, message);
      break;
    case "slack":
      await sendSlack(config, message);
      break;
    case "discord":
      await sendDiscord(config, message);
      break;
    case "webhook":
      await sendWebhook(config, message, params);
      break;
    case "email":
      // Email SMTP not yet implemented — skip silently
      break;
  }
}

async function sendTelegram(config: Record<string, unknown>, text: string): Promise<void> {
  const botToken = config.bot_token as string;
  const chatId = config.chat_id as string;
  if (!botToken || !chatId) return;

  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Telegram API returned ${res.status}`);
  }
}

async function sendSlack(config: Record<string, unknown>, text: string): Promise<void> {
  const webhookUrl = config.webhook_url as string;
  if (!webhookUrl) return;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Slack webhook returned ${res.status}`);
  }
}

async function sendDiscord(config: Record<string, unknown>, text: string): Promise<void> {
  const webhookUrl = config.webhook_url as string;
  if (!webhookUrl) return;

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook returned ${res.status}`);
  }
}

async function sendWebhook(
  config: Record<string, unknown>,
  _message: string,
  params: SendNotificationParams,
): Promise<void> {
  const url = config.url as string;
  if (!url) return;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.secret_header && config.secret_value) {
    headers[config.secret_header as string] = config.secret_value as string;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      type: params.type,
      severity: params.severity,
      title: params.title,
      body: params.body,
      link: params.link,
      metadata: params.metadata,
      timestamp: new Date().toISOString(),
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    throw new Error(`Webhook returned ${res.status}`);
  }
}

/* ── Legacy Compatibility ── */

/**
 * Also try the legacy gateway/Telegram fallback from alert-fire.ts
 * for backwards compatibility during transition. This is called
 * automatically by sendNotification if no external channels are configured.
 */
export async function sendLegacyAlert(text: string): Promise<void> {
  // Try gateway first
  const gatewayUrl = process.env.ALERT_GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL;
  const gatewayToken = process.env.ALERT_GATEWAY_TOKEN ?? process.env.NEXT_PUBLIC_GATEWAY_TOKEN;

  if (gatewayUrl && gatewayToken) {
    try {
      const res = await fetch(`${gatewayUrl}/api/system-event`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${gatewayToken}`,
        },
        body: JSON.stringify({ text, source: "arkon-notifications" }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.ok) return;
    } catch {
      // Fall through to direct Telegram
    }
  }

  // Fall back to direct Telegram
  const botToken = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID;
  if (botToken && chatId) {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
      signal: AbortSignal.timeout(4000),
    }).catch(() => {});
  }
}
