"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Mail,
  MessageSquare,
  Send,
  Globe,
  Webhook,
  CheckCircle,
  AlertTriangle,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionDescription } from "@/components/mission-control/dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

/* ── Types ── */

const NOTIFICATION_TYPES = [
  { key: "threat_critical", label: "Critical threats" },
  { key: "threat_high", label: "High threats" },
  { key: "anomaly", label: "Anomalies (spikes & silence)" },
  { key: "budget", label: "Budget threshold alerts" },
  { key: "approval", label: "Approval requests" },
  { key: "agent_offline", label: "Agent went offline" },
  { key: "infra_offline", label: "Infrastructure offline" },
  { key: "intake", label: "New intake submissions" },
  { key: "workflow_failure", label: "Workflow failures" },
] as const;

interface ChannelConfig {
  enabled: boolean;
  config: Record<string, unknown>;
}

interface ChannelDef {
  key: string;
  label: string;
  icon: LucideIcon;
  description: string;
  fields: Array<{
    key: string;
    label: string;
    type: "text" | "password";
    placeholder: string;
    help?: string;
  }>;
}

const CHANNELS: ChannelDef[] = [
  {
    key: "telegram",
    label: "Telegram",
    icon: Send,
    description: "Send alerts to a Telegram chat via bot.",
    fields: [
      { key: "bot_token", label: "Bot Token", type: "password", placeholder: "123456:ABC-DEF...", help: "Get this from @BotFather" },
      { key: "chat_id", label: "Chat ID", type: "text", placeholder: "-1001234567890", help: "Your chat or group ID" },
    ],
  },
  {
    key: "slack",
    label: "Slack",
    icon: MessageSquare,
    description: "Post alerts to a Slack channel via incoming webhook.",
    fields: [
      { key: "webhook_url", label: "Webhook URL", type: "password", placeholder: "https://hooks.slack.com/services/..." },
    ],
  },
  {
    key: "discord",
    label: "Discord",
    icon: MessageSquare,
    description: "Post alerts to a Discord channel via webhook.",
    fields: [
      { key: "webhook_url", label: "Webhook URL", type: "password", placeholder: "https://discord.com/api/webhooks/..." },
    ],
  },
  {
    key: "email",
    label: "Email",
    icon: Mail,
    description: "Receive alert emails. SMTP integration coming soon.",
    fields: [
      { key: "email", label: "Email Address", type: "text", placeholder: "you@example.com" },
    ],
  },
  {
    key: "webhook",
    label: "Generic Webhook",
    icon: Webhook,
    description: "Send JSON payloads to any URL.",
    fields: [
      { key: "url", label: "Webhook URL", type: "text", placeholder: "https://your-service.com/webhook" },
      { key: "secret_header", label: "Secret Header Name", type: "text", placeholder: "X-Webhook-Secret" },
      { key: "secret_value", label: "Secret Header Value", type: "password", placeholder: "your-secret-value" },
    ],
  },
];

/* ── Helpers ── */

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

/* ── Component ── */

export default function NotificationPreferencesPage() {
  const [channels, setChannels] = useState<Record<string, ChannelConfig>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ channel: string; ok: boolean; message: string } | null>(null);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/preferences", {
        headers: getAuthHeaders(),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { channels: Record<string, ChannelConfig> };
      setChannels(data.channels);
    } catch {
      // Silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  function getChannelState(key: string): ChannelConfig {
    return channels[key] ?? { enabled: false, config: {} };
  }

  function updateChannelConfig(channelKey: string, field: string, value: unknown) {
    setChannels((prev) => {
      const current = prev[channelKey] ?? { enabled: false, config: {} };
      return {
        ...prev,
        [channelKey]: {
          ...current,
          config: { ...current.config, [field]: value },
        },
      };
    });
  }

  function toggleChannelEnabled(channelKey: string) {
    setChannels((prev) => {
      const current = prev[channelKey] ?? { enabled: false, config: {} };
      return {
        ...prev,
        [channelKey]: { ...current, enabled: !current.enabled },
      };
    });
  }

  function toggleNotificationType(channelKey: string, typeKey: string) {
    setChannels((prev) => {
      const current = prev[channelKey] ?? { enabled: false, config: {} };
      const types = (current.config.types as Record<string, boolean>) ?? {};
      return {
        ...prev,
        [channelKey]: {
          ...current,
          config: {
            ...current.config,
            types: { ...types, [typeKey]: !types[typeKey] },
          },
        },
      };
    });
  }

  function isTypeEnabled(channelKey: string, typeKey: string): boolean {
    const state = getChannelState(channelKey);
    const types = (state.config.types as Record<string, boolean>) ?? {};
    // Default to true for critical/high threats and approvals
    if (types[typeKey] === undefined) {
      return ["threat_critical", "threat_high", "approval"].includes(typeKey);
    }
    return !!types[typeKey];
  }

  async function saveChannel(channelKey: string) {
    setSaving(channelKey);
    const state = getChannelState(channelKey);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          channel: channelKey,
          enabled: state.enabled,
          config: state.config,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setTestResult({ channel: channelKey, ok: false, message: (err as { error: string }).error });
      } else {
        setTestResult({ channel: channelKey, ok: true, message: "Saved" });
      }
    } catch {
      setTestResult({ channel: channelKey, ok: false, message: "Failed to save" });
    } finally {
      setSaving(null);
      setTimeout(() => setTestResult(null), 3000);
    }
  }

  async function testChannel(channelKey: string) {
    setTesting(channelKey);
    setTestResult(null);
    try {
      const res = await fetch("/api/notifications/test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ channel: channelKey }),
      });
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (res.ok) {
        setTestResult({ channel: channelKey, ok: true, message: data.message ?? "Test sent" });
      } else {
        setTestResult({ channel: channelKey, ok: false, message: data.error ?? "Test failed" });
      }
    } catch {
      setTestResult({ channel: channelKey, ok: false, message: "Failed to send test" });
    } finally {
      setTesting(null);
      setTimeout(() => setTestResult(null), 5000);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SectionDescription id="notifications">
        Choose how you want to be alerted when important events happen in your AI
        infrastructure. Configure multiple channels and control which notification
        types go where.
      </SectionDescription>

      {/* In-app always on */}
      <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5">
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
            <Bell className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">In-App Notifications</h3>
            <p className="text-[12px] text-[var(--text-secondary)]">
              Always active. Click the bell icon in the top nav to view.
            </p>
          </div>
          <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-[11px] font-semibold text-[var(--accent)]">
            Always On
          </span>
        </div>
      </div>

      {/* External channels */}
      {CHANNELS.map((ch) => {
        const state = getChannelState(ch.key);
        const Icon = ch.icon;
        const isExpanded = expandedChannel === ch.key;

        return (
          <div
            key={ch.key}
            className={`relative card-hover rounded-2xl border transition ${
              state.enabled
                ? "border-[var(--accent)]/30 bg-[var(--bg-primary)]"
                : "border-[var(--border)] bg-[var(--bg-primary)]"
            }`}
          >
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            {/* Channel header */}
            <button
              type="button"
              onClick={() => setExpandedChannel(isExpanded ? null : ch.key)}
              className="flex w-full items-center gap-3 p-5 text-left"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                state.enabled ? "bg-[var(--accent)]/10" : "bg-white/[0.03]"
              }`}>
                <Icon className={`h-5 w-5 ${state.enabled ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`} />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{ch.label}</h3>
                <p className="text-[12px] text-[var(--text-secondary)]">{ch.description}</p>
              </div>
              <div className="flex items-center gap-2">
                {state.enabled ? (
                  <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                    Active
                  </span>
                ) : (
                  <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)]">
                    Off
                  </span>
                )}
                <svg
                  className={`h-4 w-4 text-[var(--text-tertiary)] transition-transform ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Expanded config */}
            {isExpanded ? (
              <div className="border-t border-[var(--border)]/50 px-5 pb-5 pt-4 space-y-4">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-secondary)]">Enable {ch.label}</span>
                  <button
                    type="button"
                    onClick={() => toggleChannelEnabled(ch.key)}
                    className={`relative h-6 w-11 rounded-full transition ${
                      state.enabled ? "bg-[var(--accent)]" : "bg-[var(--bg-surface-2)]"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        state.enabled ? "translate-x-5" : ""
                      }`}
                    />
                  </button>
                </div>

                {/* Config fields */}
                {ch.fields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                      {field.label}
                    </label>
                    <input
                      type={field.type}
                      placeholder={field.placeholder}
                      value={(state.config[field.key] as string) ?? ""}
                      onChange={(e) => updateChannelConfig(ch.key, field.key, e.target.value)}
                      className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[#555566] transition focus:border-[var(--accent)]/50 focus:outline-none"
                    />
                    {field.help ? (
                      <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{field.help}</p>
                    ) : null}
                  </div>
                ))}

                {/* Notification type toggles */}
                <div>
                  <p className="text-[12px] font-medium text-[var(--text-secondary)] mb-2">
                    Notification Types
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {NOTIFICATION_TYPES.map((nt) => (
                      <label
                        key={nt.key}
                        className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] text-[var(--text-secondary)] hover:bg-white/[0.02] cursor-pointer transition"
                      >
                        <input
                          type="checkbox"
                          checked={isTypeEnabled(ch.key, nt.key)}
                          onChange={() => toggleNotificationType(ch.key, nt.key)}
                          className="h-3.5 w-3.5 rounded border-[var(--border)] bg-[var(--bg-primary)] text-[var(--accent)] focus:ring-[#00D47E]/50"
                        />
                        <span>{nt.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Action buttons + feedback */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => void saveChannel(ch.key)}
                    disabled={saving === ch.key}
                    className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent)]/90 disabled:opacity-50"
                  >
                    {saving === ch.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : null}
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => void testChannel(ch.key)}
                    disabled={testing === ch.key || !state.enabled}
                    className="flex items-center gap-1.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
                  >
                    {testing === ch.key ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    Send Test
                  </button>

                  {testResult && testResult.channel === ch.key ? (
                    <span className={`flex items-center gap-1 text-[12px] ${
                      testResult.ok ? "text-[var(--accent)]" : "text-[var(--danger)]"
                    }`}>
                      {testResult.ok ? (
                        <CheckCircle className="h-3.5 w-3.5" />
                      ) : (
                        <AlertTriangle className="h-3.5 w-3.5" />
                      )}
                      {testResult.message}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
