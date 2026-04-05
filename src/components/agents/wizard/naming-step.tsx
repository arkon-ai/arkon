"use client";

import { useCallback } from "react";
import { Tag, User } from "lucide-react";
import type { DiscoveredAgent } from "./wizard-shell";

interface NamingStepProps {
  discoveredAgents: DiscoveredAgent[];
  selectedAgentIds: string[];
  agentNames: Record<string, string>;
  agentTags: Record<string, string[]>;
  onUpdate: (update: {
    agentNames?: Record<string, string>;
    agentTags?: Record<string, string[]>;
  }) => void;
}

export function NamingStep({
  discoveredAgents, selectedAgentIds, agentNames, agentTags, onUpdate,
}: NamingStepProps) {
  const selectedAgents = discoveredAgents.filter((a) => selectedAgentIds.includes(a.agentId));

  const handleNameChange = useCallback((agentId: string, name: string) => {
    onUpdate({ agentNames: { ...agentNames, [agentId]: name } });
  }, [agentNames, onUpdate]);

  const handleTagInput = useCallback((agentId: string, value: string) => {
    const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
    onUpdate({ agentTags: { ...agentTags, [agentId]: tags } });
  }, [agentTags, onUpdate]);

  const applyToAll = useCallback((field: "name" | "tags", value: string) => {
    if (field === "tags") {
      const tags = value.split(",").map((t) => t.trim()).filter(Boolean);
      const updated: Record<string, string[]> = {};
      selectedAgents.forEach((a) => { updated[a.agentId] = tags; });
      onUpdate({ agentTags: { ...agentTags, ...updated } });
    }
  }, [selectedAgents, agentTags, onUpdate]);

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Give each agent a display name and optional tags for organization.
        {selectedAgents.length > 1 && " You can also apply tags to all agents at once."}
      </p>

      {/* Bulk tag input (only if multiple agents) */}
      {selectedAgents.length > 1 && (
        <div
          className="p-4 rounded-xl"
          style={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
        >
          <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
            Apply tags to all {selectedAgents.length} agents
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="production, primary, monitored"
              className="flex-1 px-3 py-2 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: "var(--bg-primary)",
                border: "1px solid var(--border)",
                color: "var(--text-primary)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  applyToAll("tags", (e.target as HTMLInputElement).value);
                }
              }}
            />
            <button
              onClick={(e) => {
                const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                applyToAll("tags", input.value);
              }}
              className="px-3 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
            >
              Apply
            </button>
          </div>
          <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
            Comma-separated. Press Enter or click Apply.
          </p>
        </div>
      )}

      {/* Per-agent naming */}
      <div className="space-y-3">
        {selectedAgents.map((agent) => {
          const displayName = agentNames[agent.agentId] ?? agent.name;
          const tags = agentTags[agent.agentId] ?? [];

          return (
            <div
              key={agent.agentId}
              className="p-4 rounded-xl space-y-3"
              style={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
            >
              {/* Agent ID header */}
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-mono px-2 py-0.5 rounded"
                  style={{ backgroundColor: "var(--bg-primary)", color: "var(--text-tertiary)" }}
                >
                  {agent.agentId}
                </span>
                {agent.isDefault && (
                  <span
                    className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: "rgba(0, 212, 126, 0.12)", color: "var(--accent)" }}
                  >
                    Default
                  </span>
                )}
                <span className="text-xs ml-auto" style={{ color: "var(--text-tertiary)" }}>
                  {agent.sessionCount} session{agent.sessionCount !== 1 ? "s" : ""}
                </span>
              </div>

              {/* Display name */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  <User size={11} />
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => handleNameChange(agent.agentId, e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
              </div>

              {/* Tags */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
                  <Tag size={11} />
                  Tags
                </label>
                <input
                  type="text"
                  value={tags.join(", ")}
                  onChange={(e) => handleTagInput(agent.agentId, e.target.value)}
                  placeholder="production, primary"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{
                    backgroundColor: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                  }}
                />
                <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>
                  Comma-separated
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
