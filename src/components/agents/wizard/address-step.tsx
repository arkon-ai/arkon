"use client";

import { useState, useCallback, useEffect } from "react";
import { Loader2, CheckCircle2, XCircle, Copy, Check, ChevronDown, ChevronUp } from "lucide-react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";

interface AddressStepProps {
  address: string;
  port: number;
  onUpdate: (update: { address?: string; port?: number }) => void;
  config: FrameworkConfig | null;
}

type ProbeStatus = "idle" | "probing" | "success" | "error";

export function AddressStep({ address, port, onUpdate, config }: AddressStepProps) {
  const [probeStatus, setProbeStatus] = useState<ProbeStatus>("idle");
  const [probeMessage, setProbeMessage] = useState("");
  const [showTroubleshoot, setShowTroubleshoot] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const addressField = config?.fields?.address;
  const portField = config?.fields?.port;
  const defaultPort = config?.defaultPort ?? 0;

  const runProbe = useCallback(async () => {
    if (!address || port <= 0) return;
    setProbeStatus("probing");
    setProbeMessage("");

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
          framework: config?.id ?? "custom",
        }),
      });
      const data = await res.json();

      if (data.reachable) {
        setProbeStatus("success");
        setProbeMessage(data.version ? `Connected — ${data.version}` : "Connected — gateway is reachable");
      } else {
        setProbeStatus("error");
        setProbeMessage(data.error ?? "Could not reach gateway");
      }
    } catch {
      setProbeStatus("error");
      setProbeMessage("Probe request failed — check that Arkon is running");
    }
  }, [address, port, config]);

  // Auto-probe when both address and port are filled
  useEffect(() => {
    if (!address || port <= 0) return;
    const timer = setTimeout(() => {
      void runProbe();
    }, 800);
    return () => clearTimeout(timer);
  }, [address, port, runProbe]);

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(key);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  const helperCommands = Object.entries(config?.helperCommands ?? {});

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {addressField?.helper ?? `Enter the IP address or hostname where your ${config?.label ?? "agent"} is running.`}
      </p>

      {/* Address input */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          {addressField?.label ?? "Address"}
        </label>
        <input
          type="text"
          value={address}
          onChange={(e) => onUpdate({ address: e.target.value.trim() })}
          placeholder={addressField?.placeholder ?? "192.168.1.100"}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm transition-all outline-none"
          style={{
            backgroundColor: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
          autoFocus
        />
      </div>

      {/* Port input */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          {portField?.label ?? "Port"}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            value={port || ""}
            onChange={(e) => onUpdate({ port: parseInt(e.target.value) || 0 })}
            placeholder={String(defaultPort || 8080)}
            className="w-32 px-3.5 py-2.5 rounded-xl text-sm transition-all outline-none"
            style={{
              backgroundColor: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
          />
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {portField?.helper ?? (defaultPort > 0 ? `Default: ${defaultPort}` : "")}
          </span>
        </div>
      </div>

      {/* Probe status indicator */}
      <div
        className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all"
        style={{
          backgroundColor: probeStatus === "success"
            ? "rgba(0, 212, 126, 0.08)"
            : probeStatus === "error"
              ? "rgba(239, 68, 68, 0.08)"
              : "var(--bg-surface-2)",
          border: `1px solid ${
            probeStatus === "success"
              ? "rgba(0, 212, 126, 0.2)"
              : probeStatus === "error"
                ? "rgba(239, 68, 68, 0.2)"
                : "var(--border)"
          }`,
        }}
      >
        {probeStatus === "probing" && (
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
        )}
        {probeStatus === "success" && (
          <CheckCircle2 size={16} style={{ color: "var(--accent)" }} />
        )}
        {probeStatus === "error" && (
          <XCircle size={16} style={{ color: "var(--danger)" }} />
        )}
        {probeStatus === "idle" && (
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: "var(--border)" }} />
        )}

        <span
          className="text-sm flex-1"
          style={{
            color: probeStatus === "success"
              ? "var(--accent)"
              : probeStatus === "error"
                ? "var(--danger)"
                : "var(--text-tertiary)",
          }}
        >
          {probeStatus === "idle" && "Enter address and port to auto-probe"}
          {probeStatus === "probing" && "Probing connection..."}
          {(probeStatus === "success" || probeStatus === "error") && probeMessage}
        </span>

        {(probeStatus === "success" || probeStatus === "error") && (
          <button
            onClick={runProbe}
            className="text-xs font-medium px-2 py-1 rounded-lg transition-colors"
            style={{ color: "var(--accent)", backgroundColor: "rgba(0, 212, 126, 0.1)" }}
          >
            Retry
          </button>
        )}
      </div>

      {/* Troubleshooting panel */}
      {probeStatus === "error" && (
        <div>
          <button
            onClick={() => setShowTroubleshoot(!showTroubleshoot)}
            className="flex items-center gap-1.5 text-xs font-medium"
            style={{ color: "var(--text-secondary)" }}
          >
            {showTroubleshoot ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            Troubleshooting
          </button>

          {showTroubleshoot && (
            <div
              className="mt-3 rounded-xl p-4 space-y-3"
              style={{
                backgroundColor: "rgba(6, 182, 212, 0.08)",
                border: "1px solid rgba(6, 182, 212, 0.15)",
              }}
            >
              <p className="text-xs font-medium" style={{ color: "var(--info)" }}>
                Common issues:
              </p>
              <ul className="text-xs space-y-1.5" style={{ color: "var(--text-secondary)" }}>
                <li>Check that the {config?.label ?? "agent"} service is running</li>
                <li>Verify the port is correct (default: {defaultPort || "varies"})</li>
                <li>Ensure the server is reachable from Arkon (Tailscale, firewall rules)</li>
                <li>If using Tailscale, use the 100.x.x.x IP address</li>
              </ul>

              {helperCommands.length > 0 && (
                <div className="pt-2 space-y-2">
                  <p className="text-xs font-medium" style={{ color: "var(--info)" }}>
                    Diagnostic commands:
                  </p>
                  {helperCommands.map(([key, cmd]) => (
                    <div
                      key={key}
                      className="flex items-center gap-2 rounded-lg px-3 py-2"
                      style={{ backgroundColor: "var(--bg-primary)" }}
                    >
                      <code className="flex-1 text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                        {cmd}
                      </code>
                      <button
                        onClick={() => handleCopy(cmd, key)}
                        className="flex-shrink-0 p-1 rounded-md transition-colors"
                        style={{ color: copiedCommand === key ? "var(--accent)" : "var(--text-tertiary)" }}
                      >
                        {copiedCommand === key ? <Check size={12} /> : <Copy size={12} />}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
