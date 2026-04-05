"use client";

import { Monitor, Globe, HelpCircle, Copy, Check } from "lucide-react";
import { useState, useCallback } from "react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";

type LocationChoice = "local" | "remote" | "unsure" | "";

interface LocationStepProps {
  selected: LocationChoice;
  onSelect: (location: LocationChoice) => void;
  config: FrameworkConfig | null;
  onAutoConfigLocal: () => void;
}

export function LocationStep({ selected, onSelect, config, onAutoConfigLocal }: LocationStepProps) {
  const [copiedCommand, setCopiedCommand] = useState(false);

  const helperCommand = config?.helperCommands?.findAddress ?? "";
  const frameworkLabel = config?.label ?? "agent";

  const handleCopyCommand = useCallback(async () => {
    if (!helperCommand) return;
    try {
      await navigator.clipboard.writeText(helperCommand);
      setCopiedCommand(true);
      setTimeout(() => setCopiedCommand(false), 2000);
    } catch {
      // Clipboard API might not be available
    }
  }, [helperCommand]);

  const handleLocalSelect = useCallback(() => {
    onSelect("local");
    onAutoConfigLocal();
  }, [onSelect, onAutoConfigLocal]);

  const options: Array<{
    id: LocationChoice;
    icon: typeof Monitor;
    label: string;
    description: string;
    onClick: () => void;
  }> = [
    {
      id: "local",
      icon: Monitor,
      label: "Same machine as Arkon",
      description: `The ${frameworkLabel} gateway is running on this server. Arkon will connect via localhost.`,
      onClick: handleLocalSelect,
    },
    {
      id: "remote",
      icon: Globe,
      label: "Different machine on my network",
      description: `The ${frameworkLabel} gateway is on another server. You'll provide the IP address or hostname.`,
      onClick: () => onSelect("remote"),
    },
    {
      id: "unsure",
      icon: HelpCircle,
      label: "I'm not sure",
      description: "We'll help you find your gateway.",
      onClick: () => onSelect("unsure"),
    },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Where is your {frameworkLabel} gateway running?
      </p>

      <div className="grid grid-cols-1 gap-2">
        {options.map((opt) => {
          const Icon = opt.icon;
          const isSelected = selected === opt.id;

          return (
            <button
              key={opt.id}
              onClick={opt.onClick}
              className="flex items-start gap-4 p-4 rounded-xl text-left transition-all"
              style={{
                backgroundColor: isSelected ? "var(--accent-subtle)" : "var(--bg-surface-2)",
                border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
              }}
            >
              <div
                className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center mt-0.5"
                style={{
                  backgroundColor: isSelected ? "var(--accent-muted)" : "rgba(255,255,255,0.04)",
                  color: isSelected ? "var(--accent)" : "var(--text-secondary)",
                }}
              >
                <Icon size={20} />
              </div>
              <div className="flex-1">
                <span
                  className="font-semibold text-sm"
                  style={{ color: isSelected ? "var(--accent)" : "var(--text-primary)" }}
                >
                  {opt.label}
                </span>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                  {opt.description}
                </p>
              </div>
              <div
                className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1"
                style={{
                  borderColor: isSelected ? "var(--accent)" : "var(--border-strong)",
                  backgroundColor: isSelected ? "var(--accent)" : "transparent",
                }}
              >
                {isSelected && (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: "var(--bg-primary)" }} />
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Helper panel for "unsure" */}
      {selected === "unsure" && helperCommand && (
        <div
          className="rounded-xl p-4 mt-4"
          style={{
            backgroundColor: "rgba(6, 182, 212, 0.08)",
            border: "1px solid rgba(6, 182, 212, 0.2)",
          }}
        >
          <p className="text-sm font-medium mb-2" style={{ color: "var(--info)" }}>
            Run this on your agent server:
          </p>
          <div
            className="flex items-center gap-2 rounded-lg px-3 py-2"
            style={{ backgroundColor: "var(--bg-primary)" }}
          >
            <code
              className="flex-1 text-sm font-mono"
              style={{ color: "var(--text-primary)" }}
            >
              {helperCommand}
            </code>
            <button
              onClick={handleCopyCommand}
              className="flex-shrink-0 p-1.5 rounded-md transition-colors"
              style={{ color: copiedCommand ? "var(--accent)" : "var(--text-tertiary)" }}
              title="Copy command"
            >
              {copiedCommand ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
            Look for the listening address in the output.
            If it shows a local IP (like 192.168.x.x or 100.x.x.x),
            use &quot;Different machine&quot; above and enter that address.
          </p>
          <button
            onClick={() => onSelect("remote")}
            className="mt-3 text-sm font-medium"
            style={{ color: "var(--accent)" }}
          >
            I found it — continue with remote setup &rarr;
          </button>
        </div>
      )}

      {/* Confirmation for local */}
      {selected === "local" && config && (
        <div
          className="rounded-xl p-4 mt-4"
          style={{
            backgroundColor: "var(--accent-subtle)",
            border: "1px solid rgba(0, 212, 126, 0.2)",
          }}
        >
          <p className="text-sm" style={{ color: "var(--accent)" }}>
            Auto-configured: <code className="font-mono">ws://127.0.0.1:{config.defaultPort}</code>
          </p>
          <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
            Skipping address setup — you&apos;ll go straight to connection test.
          </p>
        </div>
      )}
    </div>
  );
}
