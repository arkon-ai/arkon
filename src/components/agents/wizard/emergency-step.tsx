"use client";

import { useState, useCallback } from "react";
import { Server, Loader2, CheckCircle2, XCircle, SkipForward } from "lucide-react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";

interface EmergencyStepProps {
  sshHost: string;
  sshUser: string;
  sshKey: string;
  onUpdate: (update: { sshHost?: string; sshUser?: string; sshKey?: string }) => void;
  config: FrameworkConfig | null;
  address: string;
}

type SshTestStatus = "idle" | "testing" | "success" | "error";

export function EmergencyStep({ sshHost, sshUser, sshKey, onUpdate, config, address }: EmergencyStepProps) {
  const [testStatus, setTestStatus] = useState<SshTestStatus>("idle");
  const [testMessage, setTestMessage] = useState("");
  const [skipped, setSkipped] = useState(false);

  const sshExplanation = config?.fields?.ssh?.explanation ??
    "SSH access enables Arkon to stop/restart the agent process directly as a last-resort emergency control.";

  const testSsh = useCallback(async () => {
    const host = sshHost || address;
    if (!host || !sshUser) return;

    setTestStatus("testing");
    setTestMessage("");

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
          testSsh: true,
          sshHost: host,
          sshUser,
          sshKey: sshKey || undefined,
        }),
      });
      const data = await res.json();

      if (data.sshOk) {
        setTestStatus("success");
        setTestMessage(data.sshMessage ?? "SSH connection successful");
      } else {
        setTestStatus("error");
        setTestMessage(data.sshError ?? "SSH connection failed");
      }
    } catch {
      setTestStatus("error");
      setTestMessage("SSH test request failed");
    }
  }, [sshHost, sshUser, sshKey, address]);

  if (skipped) {
    return (
      <div className="space-y-5">
        <div
          className="flex items-center gap-3 p-4 rounded-xl"
          style={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
        >
          <SkipForward size={18} style={{ color: "var(--text-tertiary)" }} />
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
              Emergency controls skipped
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
              You can configure SSH access later from the agent settings page.
            </p>
          </div>
        </div>
        <button
          onClick={() => setSkipped(false)}
          className="text-xs font-medium"
          style={{ color: "var(--accent)" }}
        >
          Actually, I want to set this up now
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {sshExplanation}
      </p>

      {/* SSH Host */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          SSH Host
        </label>
        <input
          type="text"
          value={sshHost}
          onChange={(e) => onUpdate({ sshHost: e.target.value.trim() })}
          placeholder={address || "100.90.212.53"}
          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
          style={{
            backgroundColor: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          Defaults to the gateway address if left blank.
        </p>
      </div>

      {/* SSH User */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          SSH Username
        </label>
        <input
          type="text"
          value={sshUser}
          onChange={(e) => onUpdate({ sshUser: e.target.value.trim() })}
          placeholder="brynn"
          className="w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
          style={{
            backgroundColor: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
      </div>

      {/* SSH Key Path */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          SSH Private Key Path (optional)
        </label>
        <input
          type="text"
          value={sshKey}
          onChange={(e) => onUpdate({ sshKey: e.target.value.trim() })}
          placeholder="~/.ssh/id_ed25519"
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono outline-none"
          style={{
            backgroundColor: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          Leave blank to use the server&apos;s default SSH key.
        </p>
      </div>

      {/* Test SSH button */}
      <button
        onClick={testSsh}
        disabled={testStatus === "testing" || (!sshHost && !address) || !sshUser}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all disabled:opacity-40"
        style={{
          backgroundColor: testStatus === "success"
            ? "rgba(0, 212, 126, 0.15)"
            : testStatus === "error"
              ? "rgba(239, 68, 68, 0.15)"
              : "var(--bg-surface-2)",
          color: testStatus === "success"
            ? "var(--accent)"
            : testStatus === "error"
              ? "var(--danger)"
              : "var(--text-primary)",
          border: `1px solid ${
            testStatus === "success"
              ? "rgba(0, 212, 126, 0.2)"
              : testStatus === "error"
                ? "rgba(239, 68, 68, 0.2)"
                : "var(--border)"
          }`,
        }}
      >
        {testStatus === "testing" && <Loader2 size={14} className="animate-spin" />}
        {testStatus === "success" && <CheckCircle2 size={14} />}
        {testStatus === "error" && <XCircle size={14} />}
        {testStatus === "idle" && <Server size={14} />}

        {testStatus === "idle" && "Test SSH Connection"}
        {testStatus === "testing" && "Testing..."}
        {testStatus === "success" && "SSH Connected"}
        {testStatus === "error" && "Retry SSH Test"}
      </button>

      {testMessage && (
        <p
          className="text-xs"
          style={{ color: testStatus === "success" ? "var(--accent)" : "var(--danger)" }}
        >
          {testMessage}
        </p>
      )}

      {/* Skip option */}
      <div
        className="pt-2 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => {
            onUpdate({ sshHost: "", sshUser: "", sshKey: "" });
            setSkipped(true);
          }}
          className="flex items-center gap-1.5 text-xs font-medium"
          style={{ color: "var(--text-tertiary)" }}
        >
          <SkipForward size={12} />
          Skip — I&apos;ll set up emergency controls later
        </button>
      </div>
    </div>
  );
}
