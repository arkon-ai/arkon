"use client";

import { useState, useCallback } from "react";
import {
  Loader2, CheckCircle2, XCircle, Wifi, ExternalLink,
  AlertTriangle, ShieldAlert,
} from "lucide-react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";
import { killCapabilityColor, killCapabilityLabel, resolveDashboardUrl } from "@/lib/gateway/framework-configs";
import type { DiscoveredAgent } from "./wizard-shell";

interface TestStepProps {
  address: string;
  port: number;
  token: string;
  tlsFingerprint: string;
  discoveredAgents: DiscoveredAgent[];
  selectedAgentIds: string[];
  onUpdate: (update: {
    discoveredAgents?: DiscoveredAgent[];
    selectedAgentIds?: string[];
  }) => void;
  config: FrameworkConfig | null;
}

type TestStatus = "idle" | "testing" | "success" | "error";

export function TestStep({
  address, port, token, tlsFingerprint,
  discoveredAgents, selectedAgentIds, onUpdate, config,
}: TestStepProps) {
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [devicePaired, setDevicePaired] = useState(false);

  const dashboardUrl = config ? resolveDashboardUrl(config, address, port) : null;

  const runTest = useCallback(async () => {
    setTestStatus("testing");
    setTestMessage("");
    setDevicePaired(false);

    try {
      const csrfMatch = document.cookie.match(/mc_csrf=([^;]+)/);
      const csrfToken = csrfMatch ? decodeURIComponent(csrfMatch[1]) : "";
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["x-csrf-token"] = csrfToken;

      const res = await fetch("/api/gateway/probe", {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          host: address,
          port,
          token,
          tlsFingerprint,
          framework: config?.id ?? "custom",
          discover: true,
        }),
      });
      const data = await res.json();

      if (data.reachable) {
        setTestStatus("success");
        setDevicePaired(!!data.paired);

        const agents: DiscoveredAgent[] = (data.agents ?? []).map((a: Record<string, unknown>) => ({
          agentId: String(a.id ?? a.agentId ?? a.name ?? "unknown"),
          name: String(a.name ?? a.displayName ?? a.id ?? "Unnamed Agent"),
          isDefault: !!a.isDefault,
          sessionCount: Number(a.sessionCount ?? a.sessions ?? 0),
        }));

        // If no agents discovered, create a placeholder
        if (agents.length === 0) {
          agents.push({
            agentId: "default",
            name: config?.label ? `${config.label} Agent` : "Default Agent",
            isDefault: true,
            sessionCount: 0,
          });
        }

        const allIds = agents.map((a) => a.agentId);
        onUpdate({ discoveredAgents: agents, selectedAgentIds: allIds });
        setTestMessage(
          data.version
            ? `Connected to ${data.version} — ${agents.length} agent${agents.length !== 1 ? "s" : ""} found`
            : `Connected — ${agents.length} agent${agents.length !== 1 ? "s" : ""} found`
        );
      } else {
        setTestStatus("error");
        setTestMessage(data.error ?? "Connection test failed");
        onUpdate({ discoveredAgents: [], selectedAgentIds: [] });
      }
    } catch {
      setTestStatus("error");
      setTestMessage("Test request failed — check that Arkon is running");
      onUpdate({ discoveredAgents: [], selectedAgentIds: [] });
    }
  }, [address, port, token, tlsFingerprint, config, onUpdate]);

  const toggleAgent = useCallback((agentId: string) => {
    const isSelected = selectedAgentIds.includes(agentId);
    onUpdate({
      selectedAgentIds: isSelected
        ? selectedAgentIds.filter((id) => id !== agentId)
        : [...selectedAgentIds, agentId],
    });
  }, [selectedAgentIds, onUpdate]);

  const toggleAll = useCallback(() => {
    if (selectedAgentIds.length === discoveredAgents.length) {
      onUpdate({ selectedAgentIds: [] });
    } else {
      onUpdate({ selectedAgentIds: discoveredAgents.map((a) => a.agentId) });
    }
  }, [selectedAgentIds, discoveredAgents, onUpdate]);

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        Test the connection to your {config?.label ?? "agent"} and discover registered agents.
      </p>

      {/* Big test button */}
      <button
        onClick={runTest}
        disabled={testStatus === "testing"}
        className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl text-base font-semibold transition-all"
        style={{
          backgroundColor: testStatus === "success"
            ? "rgba(0, 212, 126, 0.15)"
            : testStatus === "error"
              ? "rgba(239, 68, 68, 0.15)"
              : "var(--accent)",
          color: testStatus === "success"
            ? "var(--accent)"
            : testStatus === "error"
              ? "var(--danger)"
              : "var(--accent-foreground)",
          border: `1px solid ${
            testStatus === "success"
              ? "rgba(0, 212, 126, 0.3)"
              : testStatus === "error"
                ? "rgba(239, 68, 68, 0.3)"
                : "transparent"
          }`,
          cursor: testStatus === "testing" ? "wait" : "pointer",
        }}
      >
        {testStatus === "testing" && <Loader2 size={20} className="animate-spin" />}
        {testStatus === "success" && <CheckCircle2 size={20} />}
        {testStatus === "error" && <XCircle size={20} />}
        {testStatus === "idle" && <Wifi size={20} />}

        {testStatus === "idle" && "Test Connection"}
        {testStatus === "testing" && "Testing..."}
        {testStatus === "success" && "Connected"}
        {testStatus === "error" && "Retry Connection"}
      </button>

      {/* Status message */}
      {testMessage && (
        <p
          className="text-sm text-center"
          style={{ color: testStatus === "success" ? "var(--accent)" : "var(--danger)" }}
        >
          {testMessage}
        </p>
      )}

      {/* Device pairing indicator */}
      {devicePaired && (
        <div
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl"
          style={{ backgroundColor: "rgba(0, 212, 126, 0.08)", border: "1px solid rgba(0, 212, 126, 0.15)" }}
        >
          <CheckCircle2 size={14} style={{ color: "var(--accent)" }} />
          <span className="text-xs" style={{ color: "var(--accent)" }}>
            Device paired — Arkon is recognized by this gateway
          </span>
        </div>
      )}

      {/* Dashboard link */}
      {testStatus === "success" && dashboardUrl && (
        <a
          href={dashboardUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs font-medium"
          style={{ color: "var(--accent)" }}
        >
          <ExternalLink size={12} />
          Open {config?.dashboardLabel ?? "Dashboard"}
        </a>
      )}

      {/* Discovered agents */}
      {discoveredAgents.length > 0 && testStatus === "success" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
              Discovered Agents ({discoveredAgents.length})
            </span>
            <button
              onClick={toggleAll}
              className="text-xs font-medium"
              style={{ color: "var(--accent)" }}
            >
              {selectedAgentIds.length === discoveredAgents.length ? "Deselect All" : "Select All"}
            </button>
          </div>

          <div className="space-y-1.5">
            {discoveredAgents.map((agent) => {
              const isSelected = selectedAgentIds.includes(agent.agentId);
              return (
                <button
                  key={agent.agentId}
                  onClick={() => toggleAgent(agent.agentId)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all"
                  style={{
                    backgroundColor: isSelected ? "var(--accent-subtle)" : "var(--bg-surface-2)",
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  {/* Checkbox */}
                  <div
                    className="flex-shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center"
                    style={{
                      width: 18,
                      height: 18,
                      backgroundColor: isSelected ? "var(--accent)" : "transparent",
                      border: `2px solid ${isSelected ? "var(--accent)" : "var(--border-strong)"}`,
                      borderRadius: 4,
                    }}
                  >
                    {isSelected && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="var(--bg-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                        {agent.name}
                      </span>
                      {agent.isDefault && (
                        <span
                          className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "rgba(0, 212, 126, 0.12)", color: "var(--accent)" }}
                        >
                          Default
                        </span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {agent.agentId} &middot; {agent.sessionCount} session{agent.sessionCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Kill capability warning */}
      {testStatus === "success" && config && config.killCapability !== "full" && (
        <div
          className="flex gap-3 p-3 rounded-xl"
          style={{
            backgroundColor: config.killCapability === "none"
              ? "rgba(239, 68, 68, 0.08)"
              : "rgba(245, 158, 11, 0.08)",
            border: `1px solid ${
              config.killCapability === "none"
                ? "rgba(239, 68, 68, 0.15)"
                : "rgba(245, 158, 11, 0.15)"
            }`,
          }}
        >
          {config.killCapability === "none" ? (
            <ShieldAlert size={16} className="flex-shrink-0 mt-0.5 text-red-400" />
          ) : (
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5 text-amber-400" />
          )}
          <div>
            <p className={`text-xs font-medium ${killCapabilityColor(config.killCapability)}`}>
              {killCapabilityLabel(config.killCapability)}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              {config.killMethod}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
