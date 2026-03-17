/**
 * AlertFire — Arkon Real-Time Threat Alerting
 *
 * Now delegates to the multi-channel notification engine (src/lib/notifications.ts).
 * Kept as a thin wrapper for API compatibility with existing callers.
 */

import type { ThreatResult, ThreatLevel } from "./threat-scanner";
import { sendNotification, sendLegacyAlert } from "./notifications";

interface AlertContext {
  agentId: string;
  agentName: string;
  eventType: string;
  sessionKey?: string;
  createdAt: string;
  tenantId?: string;
}

/**
 * Fire an alert for a threat event.
 * Creates in-app notification + dispatches to all configured channels.
 * Falls back to legacy Telegram if no channels configured.
 * Never throws — alert failure should not break ingest.
 */
export async function fireAlert(
  ctx: AlertContext,
  threat: ThreatResult,
): Promise<void> {
  const minLevel = (process.env.ALERT_MIN_LEVEL ?? "high") as ThreatLevel;
  const levelRank: Record<ThreatLevel, number> = { none: 0, low: 1, medium: 2, high: 3, critical: 4 };

  if ((levelRank[threat.level] ?? 0) < (levelRank[minLevel] ?? 3)) return;

  const classes = threat.classes.map((c) => c.replace(/_/g, " ").toUpperCase()).join(", ");
  const topMatch = threat.matches[0];
  const severity = threat.level === "critical" ? "critical" as const : "warning" as const;

  try {
    await sendNotification({
      tenantId: ctx.tenantId ?? "default",
      type: "threat",
      severity,
      title: `${threat.level.toUpperCase()} threat detected — ${ctx.agentName}`,
      body: [
        `Class: ${classes}`,
        `Event: ${ctx.eventType}`,
        topMatch ? `Match: "${topMatch.pattern}"` : null,
        topMatch ? `Context: ${topMatch.excerpt.slice(0, 100)}` : null,
      ].filter(Boolean).join("\n"),
      link: `/agents/${ctx.agentId}`,
      metadata: {
        agentId: ctx.agentId,
        threatLevel: threat.level,
        threatClasses: threat.classes,
        sessionKey: ctx.sessionKey,
      },
    });
  } catch {
    // Fall back to legacy Telegram
    try {
      const emoji = threat.level === "critical" ? "\u{1F6A8}" : "\u26A0\uFE0F";
      const text = [
        `${emoji} THREAT DETECTED — Arkon`,
        `Agent: ${ctx.agentName} (${ctx.agentId})`,
        `Level: ${threat.level.toUpperCase()}`,
        `Class: ${classes}`,
        topMatch ? `Match: "${topMatch.pattern}"` : null,
      ].filter(Boolean).join("\n");
      await sendLegacyAlert(text);
    } catch {
      console.error("[alert-fire] Failed to send threat alert");
    }
  }
}


/* ── Approval Alerts ── */

interface ApprovalAlertContext {
  id: number;
  title: string;
  agentId: string;
  priority: string;
  channel?: string;
  contentPreview: string;
  tenantId?: string;
}

/**
 * Fire an alert for a new approval request.
 * Delegates to notification engine.
 * Never throws.
 */
export async function fireApprovalAlert(ctx: ApprovalAlertContext): Promise<void> {
  try {
    await sendNotification({
      tenantId: ctx.tenantId ?? "default",
      type: "approval",
      severity: ctx.priority === "urgent" ? "critical" : "info",
      title: `New approval request: ${ctx.title}`,
      body: [
        `Agent: ${ctx.agentId}`,
        `Priority: ${ctx.priority.toUpperCase()}`,
        ctx.channel ? `Channel: ${ctx.channel}` : null,
        `Preview: ${ctx.contentPreview}${ctx.contentPreview.length >= 120 ? "\u2026" : ""}`,
      ].filter(Boolean).join("\n"),
      link: "/tools/approvals",
      metadata: {
        approvalId: ctx.id,
        agentId: ctx.agentId,
        priority: ctx.priority,
      },
    });
  } catch {
    // Fall back to legacy
    try {
      const emoji = ctx.priority === "urgent" ? "\u{1F6A8}" : "\u{1F4CB}";
      const text = [
        `${emoji} NEW APPROVAL REQUEST`,
        `Title: ${ctx.title}`,
        `Agent: ${ctx.agentId}`,
        `Priority: ${ctx.priority.toUpperCase()}`,
      ].join("\n");
      await sendLegacyAlert(text);
    } catch {
      console.error("[alert-fire] Failed to send approval alert");
    }
  }
}
