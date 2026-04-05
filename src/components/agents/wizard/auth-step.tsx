"use client";

import { useState, useCallback } from "react";
import { Eye, EyeOff, Copy, Check, KeyRound } from "lucide-react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";

interface AuthStepProps {
  token: string;
  onUpdate: (update: { token: string }) => void;
  config: FrameworkConfig | null;
}

export function AuthStep({ token, onUpdate, config }: AuthStepProps) {
  const [showToken, setShowToken] = useState(false);
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const tokenField = config?.fields?.token;
  const authType = config?.authType ?? "token";
  const isOptional = authType === "none";

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(key);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  return (
    <div className="space-y-5">
      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {tokenField?.helper ?? `Enter the authentication credential for your ${config?.label ?? "agent"}.`}
      </p>

      {/* Token input with show/hide */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          <span className="flex items-center gap-1.5">
            <KeyRound size={12} />
            {tokenField?.label ?? "Authentication Token"}
            {isOptional && (
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "var(--bg-surface-2)", color: "var(--text-tertiary)" }}>
                Optional
              </span>
            )}
          </span>
        </label>
        <div className="relative">
          <input
            type={showToken ? "text" : "password"}
            value={token}
            onChange={(e) => onUpdate({ token: e.target.value })}
            placeholder={isOptional ? "Leave blank if no auth required" : "Paste your token here"}
            className="w-full px-3.5 py-2.5 pr-12 rounded-xl text-sm font-mono transition-all outline-none"
            style={{
              backgroundColor: "var(--bg-surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button
            onClick={() => setShowToken(!showToken)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors"
            style={{ color: "var(--text-tertiary)" }}
            title={showToken ? "Hide token" : "Show token"}
          >
            {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </div>

      {/* Find command */}
      {tokenField?.findCommand && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Find your {tokenField.label?.toLowerCase() ?? "token"}:
          </p>
          <div
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            <code className="flex-1 text-xs font-mono break-all" style={{ color: "var(--text-primary)" }}>
              {tokenField.findCommand}
            </code>
            <button
              onClick={() => handleCopy(tokenField.findCommand!, "find")}
              className="flex-shrink-0 p-1 rounded-md transition-colors"
              style={{ color: copiedCommand === "find" ? "var(--accent)" : "var(--text-tertiary)" }}
            >
              {copiedCommand === "find" ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* Set command */}
      {tokenField?.setCommand && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Or generate a new one:
          </p>
          <div
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            <code className="flex-1 text-xs font-mono break-all" style={{ color: "var(--text-primary)" }}>
              {tokenField.setCommand}
            </code>
            <button
              onClick={() => handleCopy(tokenField.setCommand!, "set")}
              className="flex-shrink-0 p-1 rounded-md transition-colors"
              style={{ color: copiedCommand === "set" ? "var(--accent)" : "var(--text-tertiary)" }}
            >
              {copiedCommand === "set" ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* Security note */}
      <div
        className="flex gap-3 p-3 rounded-xl"
        style={{ backgroundColor: "var(--bg-surface-2)", border: "1px solid var(--border)" }}
      >
        <KeyRound size={14} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)" }} />
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Your token is stored encrypted in the Arkon database and never displayed in logs or chat.
        </p>
      </div>
    </div>
  );
}
