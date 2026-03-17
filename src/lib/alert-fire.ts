/**
 * AlertFire — Arkon Real-Time Threat Alerting
 * Fires instant alerts to OpenClaw gateway (→ Telegram) on HIGH/CRITICAL threats.
 * Falls back to direct Telegram Bot API if gateway is unreachable.
 */

import type { ThreatResult, ThreatLevel } from "./threat-scanner";

interface AlertContext {
  agentId: string;
  agentName: string;
  eventType: string;
  sessionKey?: string;
  createdAt: string;
}

function levelEmoji(level: ThreatLevel): string {
  switch (level) {
    case "critical": return "🚨";
    case "high": return "⚠️";
    default: return "ℹ️";
  }
}

function buildAlertText(ctx: AlertContext, threat: ThreatResult): string {
  const emoji = levelEmoji(threat.level);
  const classes = threat.classes.map((c) => c.replace(/_/g, " ").toUpperCase()).join(", ");
  const topMatch = threat.matches[0];

  const lines = [
    `${emoji} THREAT DETECTED — Arkon`,
    `Agent: ${ctx.agentName} (${ctx.agentId})`,
    `Level: ${threat.level.toUpperCase()}`,
    `Class: ${classes}`,
    `Event: ${ctx.eventType}`,
    topMatch ? `Match: "${topMatch.pattern}"` : null,
    topMatch ? `Context: ${topMatch.excerpt.slice(0, 100)}` : null,
    `Time: ${new Date(ctx.createdAt).toLocaleTimeString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })} SAST`,
    ctx.sessionKey ? `Session: ${ctx.sessionKey.slice(0, 16)}…` : null,
    ``,
    `→ Review: ${process.env.ARKON_BASE_URL ?? "http://localhost:3000"}/agent/${ctx.agentId}`,
  ].filter(Boolean);

  return lines.join("\n");
}

async function fireViaGateway(text: string): Promise<boolean> {
  const url = process.env.ALERT_GATEWAY_URL ?? process.env.NEXT_PUBLIC_GATEWAY_URL;
  const token = process.env.ALERT_GATEWAY_TOKEN ?? process.env.NEXT_PUBLIC_GATEWAY_TOKEN;

  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/api/system-event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ text, source: "mission-control-threatguard" }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function fireViaTelegram(text: string): Promise<boolean> {
  const botToken = process.env.ALERT_TELEGRAM_BOT_TOKEN;
  const chatId = process.env.ALERT_TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) return false;

  try {
    const res = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
        signal: AbortSignal.timeout(4000),
      },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fire an alert for a threat event.
 * Tries gateway first, falls back to direct Telegram.
 * Never throws — alert failure should not break ingest.
 */
export async function fireAlert(
  ctx: AlertContext,
  threat: ThreatResult,
): Promise<void> {
  const minLevel = (process.env.ALERT_MIN_LEVEL ?? "high") as ThreatLevel;
  const levelRank: Record<ThreatLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

  if ((levelRank[threat.level] ?? 0) < (levelRank[minLevel] ?? 3)) return;

  const text = buildAlertText(ctx, threat);

  try {
    const gatewaySent = await fireViaGateway(text);
    if (!gatewaySent) {
      await fireViaTelegram(text);
    }
  } catch {
    // Alert failure is non-fatal — ingest continues
    console.error("[alert-fire] Failed to send threat alert");
  }
}


/* ── Approval Alerts (Phase 4) ── */

interface ApprovalAlertContext {
  id: number;
  title: string;
  agentId: string;
  priority: string;
  channel?: string;
  contentPreview: string;
}

function buildApprovalAlertText(ctx: ApprovalAlertContext): string {
  const priorityEmoji = ctx.priority === "urgent" ? "\u{1F6A8}" : "\u{1F4CB}";
  const lines = [
    `${priorityEmoji} NEW APPROVAL REQUEST`,
    `Title: ${ctx.title}`,
    `Agent: ${ctx.agentId}`,
    `Priority: ${ctx.priority.toUpperCase()}`,
    ctx.channel ? `Channel: ${ctx.channel}` : null,
    ``,
    `Preview: ${ctx.contentPreview}${ctx.contentPreview.length >= 120 ? "\u2026" : ""}`,
    ``,
    `\u2192 Review: ${process.env.ARKON_BASE_URL ?? "http://localhost:3000"}/tools/approvals`,
  ].filter(Boolean);
  return lines.join("\n");
}

/**
 * Fire a Telegram alert for a new approval request.
 * Tries gateway first, falls back to direct Telegram.
 * Never throws.
 */
export async function fireApprovalAlert(ctx: ApprovalAlertContext): Promise<void> {
  const text = buildApprovalAlertText(ctx);
  try {
    const gatewaySent = await fireViaGateway(text);
    if (!gatewaySent) {
      await fireViaTelegram(text);
    }
  } catch {
    console.error("[alert-fire] Failed to send approval alert");
  }
}
