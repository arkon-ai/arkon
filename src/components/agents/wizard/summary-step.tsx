"use client";

import { useState } from "react";
import {
  Server, Shield, KeyRound, Users, Terminal, Loader2, CheckCircle2,
} from "lucide-react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";
import { FRAMEWORK_CONFIGS, killCapabilityLabel, killCapabilityColor } from "@/lib/gateway/framework-configs";
import type { WizardData } from "./wizard-shell";

interface SummaryStepProps {
  data: WizardData;
  config: FrameworkConfig | null;
  onSave: () => Promise<void>;
}

function maskToken(token: string): string {
  if (!token) return "(none)";
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

export function SummaryStep({ data, config, onSave }: SummaryStepProps) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fw = config ?? FRAMEWORK_CONFIGS[data.frameworkId];
  const selectedAgents = data.discoveredAgents.filter((a) => data.selectedAgentIds.includes(a.agentId));

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save agent configuration");
      setSaving(false);
    }
  };

  const rows: Array<{ icon: typeof Server; label: string; value: string; muted?: boolean }> = [
    {
      icon: Server,
      label: "Framework",
      value: fw?.label ?? data.frameworkId,
    },
    {
      icon: Server,
      label: "Connection",
      value: data.location === "local"
        ? `localhost:${data.port}`
        : `${data.address}:${data.port}`,
    },
    {
      icon: Shield,
      label: "TLS",
      value: data.tlsFingerprint
        ? `Pinned (${data.tlsFingerprint.slice(0, 16)}...)`
        : fw?.tlsRequired ? "Enabled (no pin)" : "Disabled",
    },
    {
      icon: KeyRound,
      label: fw?.fields?.token?.label ?? "Token",
      value: maskToken(data.token),
      muted: !data.token,
    },
    {
      icon: Users,
      label: "Agents",
      value: `${selectedAgents.length} selected`,
    },
  ];

  if (data.sshHost || data.sshUser) {
    rows.push({
      icon: Terminal,
      label: "Emergency SSH",
      value: `${data.sshUser || "brynn"}@${data.sshHost || data.address}`,
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Review your configuration before saving.
      </p>

      {/* Config card */}
      <div
        className="rounded-xl overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        {rows.map((row, i) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                backgroundColor: "var(--bg-surface-2)",
                borderTop: i > 0 ? "1px solid var(--border)" : undefined,
              }}
            >
              <Icon size={14} className="flex-shrink-0" style={{ color: "var(--text-tertiary)" }} />
              <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
                {row.label}
              </span>
              <span
                className="text-sm font-mono flex-1 text-right truncate"
                style={{ color: row.muted ? "var(--text-tertiary)" : "var(--text-primary)" }}
              >
                {row.value}
              </span>
            </div>
          );
        })}
      </div>

      {/* Kill capability */}
      {fw && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-xl"
          style={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
        >
          <Shield size={14} className="flex-shrink-0" style={{ color: "var(--text-tertiary)" }} />
          <span className="text-xs font-medium w-28 flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
            Kill Switch
          </span>
          <span className={`text-sm font-medium flex-1 text-right ${killCapabilityColor(fw.killCapability)}`}>
            {killCapabilityLabel(fw.killCapability)}
          </span>
        </div>
      )}

      {/* Agent list */}
      {selectedAgents.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Agents to register ({selectedAgents.length})
          </p>
          <div className="space-y-1">
            {selectedAgents.map((agent) => (
              <div
                key={agent.agentId}
                className="flex items-center gap-3 px-3 py-2 rounded-lg"
                style={{ backgroundColor: "var(--bg-surface-2)" }}
              >
                <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {data.agentNames[agent.agentId] || agent.name}
                </span>
                {(data.agentTags[agent.agentId] ?? []).map((tag) => (
                  <span
                    key={tag}
                    className="text-[10px] px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: "rgba(0, 212, 126, 0.1)", color: "var(--accent)" }}
                  >
                    {tag}
                  </span>
                ))}
                <span className="text-xs ml-auto font-mono" style={{ color: "var(--text-tertiary)" }}>
                  {agent.agentId}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-sm text-center" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-semibold transition-all"
        style={{
          backgroundColor: "var(--accent)",
          color: "var(--accent-foreground)",
          cursor: saving ? "wait" : "pointer",
        }}
      >
        {saving ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Saving...
          </>
        ) : (
          <>
            <CheckCircle2 size={16} />
            Save &amp; Connect
          </>
        )}
      </button>
    </div>
  );
}
