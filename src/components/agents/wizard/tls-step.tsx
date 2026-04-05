"use client";

import { useState, useCallback } from "react";
import { ShieldCheck, Copy, Check, Info } from "lucide-react";
import type { FrameworkConfig } from "@/lib/gateway/framework-configs";

interface TlsStepProps {
  tlsFingerprint: string;
  onUpdate: (update: { tlsFingerprint: string }) => void;
  config: FrameworkConfig | null;
}

export function TlsStep({ tlsFingerprint, onUpdate, config }: TlsStepProps) {
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null);

  const tlsField = config?.fields?.tls;
  const enableCommand = tlsField?.enableCommand ?? "";
  const fingerprintCommand = tlsField?.fingerprintCommand ?? "";

  const handleCopy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCommand(key);
      setTimeout(() => setCopiedCommand(null), 2000);
    } catch { /* clipboard not available */ }
  }, []);

  return (
    <div className="space-y-5">
      {/* TLS explanation */}
      <div
        className="flex gap-3 p-4 rounded-xl"
        style={{
          backgroundColor: "rgba(6, 182, 212, 0.08)",
          border: "1px solid rgba(6, 182, 212, 0.15)",
        }}
      >
        <ShieldCheck size={20} className="flex-shrink-0 mt-0.5" style={{ color: "var(--info)" }} />
        <div className="space-y-1.5">
          <p className="text-sm font-medium" style={{ color: "var(--info)" }}>
            Secure Connection
          </p>
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {tlsField?.explanation ??
              "TLS encrypts the connection between Arkon and your agent gateway, preventing credential interception."}
          </p>
        </div>
      </div>

      {/* Enable TLS commands */}
      {enableCommand && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Enable TLS on your gateway:
          </p>
          <div
            className="rounded-xl overflow-hidden"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            {enableCommand.split("\n").map((line, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3.5 py-2"
                style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}
              >
                <code className="flex-1 text-xs font-mono" style={{ color: "var(--text-primary)" }}>
                  {line}
                </code>
                <button
                  onClick={() => handleCopy(line, `enable-${i}`)}
                  className="flex-shrink-0 p-1 rounded-md transition-colors"
                  style={{ color: copiedCommand === `enable-${i}` ? "var(--accent)" : "var(--text-tertiary)" }}
                >
                  {copiedCommand === `enable-${i}` ? <Check size={12} /> : <Copy size={12} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SHA-256 fingerprint input */}
      <div>
        <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--text-secondary)" }}>
          TLS Certificate Fingerprint (SHA-256)
        </label>
        <input
          type="text"
          value={tlsFingerprint}
          onChange={(e) => onUpdate({ tlsFingerprint: e.target.value.trim() })}
          placeholder="AB:CD:EF:12:34:56:..."
          className="w-full px-3.5 py-2.5 rounded-xl text-sm font-mono transition-all outline-none"
          style={{
            backgroundColor: "var(--bg-surface-2)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          }}
        />
        <p className="text-xs mt-1.5" style={{ color: "var(--text-tertiary)" }}>
          Optional — used for certificate pinning. Leave blank to trust any valid TLS certificate.
        </p>
      </div>

      {/* Find fingerprint command */}
      {fingerprintCommand && (
        <div>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
            Find the fingerprint:
          </p>
          <div
            className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
            style={{ backgroundColor: "var(--bg-primary)", border: "1px solid var(--border)" }}
          >
            <code className="flex-1 text-xs font-mono" style={{ color: "var(--text-primary)" }}>
              {fingerprintCommand}
            </code>
            <button
              onClick={() => handleCopy(fingerprintCommand, "fingerprint")}
              className="flex-shrink-0 p-1 rounded-md transition-colors"
              style={{ color: copiedCommand === "fingerprint" ? "var(--accent)" : "var(--text-tertiary)" }}
            >
              {copiedCommand === "fingerprint" ? <Check size={12} /> : <Copy size={12} />}
            </button>
          </div>
        </div>
      )}

      {/* Tailscale Serve alternative */}
      <div
        className="flex gap-3 p-4 rounded-xl"
        style={{
          backgroundColor: "var(--bg-surface-2)",
          border: "1px solid var(--border)",
        }}
      >
        <Info size={16} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-tertiary)" }} />
        <div>
          <p className="text-xs font-medium mb-1" style={{ color: "var(--text-secondary)" }}>
            Alternative: Tailscale Serve
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            If both machines are on Tailscale, you can use <code className="font-mono">tailscale serve</code> to
            automatically provide TLS without manual certificate management. The fingerprint field can be left blank.
          </p>
        </div>
      </div>
    </div>
  );
}
