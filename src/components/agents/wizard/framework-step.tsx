"use client";

import {
  Cpu, Paperclip, GitBranch, Workflow, Network, Bot, Terminal,
  Search, Shield, Users, Plug,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  getFrameworksByStatus,
  killCapabilityColor,
  killCapabilityLabel,
  type FrameworkConfig,
  type FrameworkStatus,
} from "@/lib/gateway/framework-configs";

// Map icon string names to actual Lucide components
const ICON_MAP: Record<string, LucideIcon> = {
  Cpu, Paperclip, GitBranch, Workflow, Network, Bot, Terminal,
  Search, Shield, Users, Plug,
};

const STATUS_LABELS: Record<FrameworkStatus, string> = {
  supported: "Supported",
  beta: "Beta",
  "coming-soon": "Coming Soon",
};

const STATUS_COLORS: Record<FrameworkStatus, string> = {
  supported: "var(--accent)",
  beta: "var(--warning)",
  "coming-soon": "var(--text-tertiary)",
};

interface FrameworkStepProps {
  selectedId: string;
  onSelect: (frameworkId: string) => void;
}

export function FrameworkStep({ selectedId, onSelect }: FrameworkStepProps) {
  const grouped = getFrameworksByStatus();

  return (
    <div className="space-y-6">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Select the agent framework you want to connect to Arkon.
        This determines how Arkon communicates with and controls the agent.
      </p>

      {(["supported", "beta", "coming-soon"] as FrameworkStatus[]).map((status) => {
        const frameworks = grouped[status];
        if (frameworks.length === 0) return null;
        return (
          <div key={status}>
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: STATUS_COLORS[status] }}
              >
                {STATUS_LABELS[status]}
              </span>
              <div className="flex-1 h-px" style={{ backgroundColor: "var(--border)" }} />
            </div>

            <div className="grid grid-cols-1 gap-2">
              {frameworks.map((fw) => (
                <FrameworkOption
                  key={fw.id}
                  config={fw}
                  isSelected={selectedId === fw.id}
                  isDisabled={fw.status === "coming-soon"}
                  onSelect={() => onSelect(fw.id)}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FrameworkOption({
  config,
  isSelected,
  isDisabled,
  onSelect,
}: {
  config: FrameworkConfig;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: () => void;
}) {
  const Icon = ICON_MAP[config.icon] ?? Plug;

  return (
    <button
      onClick={onSelect}
      disabled={isDisabled}
      className="w-full flex items-center gap-4 p-4 rounded-xl text-left transition-all"
      style={{
        backgroundColor: isSelected ? "var(--accent-subtle)" : "var(--bg-surface-2)",
        border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
        opacity: isDisabled ? 0.4 : 1,
        cursor: isDisabled ? "not-allowed" : "pointer",
      }}
    >
      {/* Icon */}
      <div
        className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
        style={{
          backgroundColor: isSelected ? "var(--accent-muted)" : "rgba(255,255,255,0.04)",
          color: isSelected ? "var(--accent)" : "var(--text-secondary)",
        }}
      >
        <Icon size={20} />
      </div>

      {/* Label + description */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="font-semibold text-sm"
            style={{ color: isSelected ? "var(--accent)" : "var(--text-primary)" }}
          >
            {config.label}
          </span>
          {config.status === "beta" && (
            <span
              className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
              style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "var(--warning)" }}
            >
              Beta
            </span>
          )}
        </div>
        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>
          {config.description}
        </p>
      </div>

      {/* Kill capability badge */}
      <div className="flex-shrink-0 text-right">
        <span className={`text-[11px] font-medium ${killCapabilityColor(config.killCapability)}`}>
          {killCapabilityLabel(config.killCapability)}
        </span>
      </div>

      {/* Selection indicator */}
      <div
        className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center"
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
}
