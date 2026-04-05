"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Power, Shield, Loader2, RotateCcw } from "lucide-react";

interface GatewayStatus {
  gateway_host: string;
  gateway_status: "online" | "unreachable";
  ok?: boolean;
  session_count?: number;
  agent_count?: number;
  running_sessions?: number;
  agents?: { id: string; is_default: boolean }[];
  warning?: string;
  error?: string;
}

interface StopResult {
  ok: boolean;
  verified_down: boolean;
  gateway_host: string;
  method: string;
  detail: string;
  pre_stop_snapshot?: {
    session_count: number;
    running_sessions: number;
    agent_count: number;
  };
  reason: string | null;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

export function NuclearGatewayStopModal({
  onClose,
}: {
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<"preflight" | "confirm" | "executing" | "result">("preflight");
  const [status, setStatus] = useState<GatewayStatus | null>(null);
  const [result, setResult] = useState<StopResult | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch gateway status on mount
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/gateway/stop-gateway", {
          headers: getAuthHeaders(),
        });
        const data = await res.json();
        if (res.ok) {
          setStatus(data);
          setPhase("confirm");
        } else {
          setError(data.error ?? "Failed to fetch gateway status");
        }
      } catch {
        setError("Cannot reach Arkon API");
      }
    };
    fetchStatus();
  }, []);

  // Focus confirm input when entering confirm phase
  useEffect(() => {
    if (phase === "confirm") {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [phase]);

  // Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "executing") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, phase]);

  const handleExecute = useCallback(async () => {
    if (confirmText !== "STOP") return;
    setPhase("executing");
    setError(null);

    try {
      const res = await fetch("/api/gateway/stop-gateway", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          confirm_code: "STOP",
          reason: reason || undefined,
        }),
      });
      const data = await res.json();
      setResult(data);
      setPhase("result");
    } catch {
      setError("Failed to execute nuclear stop");
      setPhase("confirm");
    }
  }, [confirmText, reason]);

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={phase !== "executing" ? onClose : undefined}
        role="button"
        aria-label="Close"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape" && phase !== "executing") onClose(); }}
      />
      <div className="relative w-full max-w-lg rounded-2xl border-2 border-amber-500/50 bg-[var(--bg-surface)] shadow-[0_20px_80px_rgba(245,158,11,0.2)]">
        {/* Hazard header */}
        <div className="flex items-center gap-3 border-b border-amber-500/30 bg-amber-500/5 px-6 py-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 ring-2 ring-amber-500/30">
            <Power className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <h3 className="text-[15px] font-bold text-amber-200">Nuclear Gateway Stop</h3>
            <p className="text-[12px] text-amber-400/70">OpenCLAW Emergency Shutdown</p>
          </div>
        </div>

        <div className="p-6">
          {/* Preflight loading */}
          {phase === "preflight" && !error && (
            <div className="flex items-center justify-center gap-3 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
              <span className="text-[13px] text-[var(--text-secondary)]">Probing gateway status...</span>
            </div>
          )}

          {/* Error state */}
          {error && phase !== "result" && (
            <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
              <p className="text-[13px] text-red-300">{error}</p>
            </div>
          )}

          {/* Confirm phase */}
          {phase === "confirm" && status && (
            <>
              {/* Gateway info card */}
              <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Shield className="h-4 w-4 text-amber-400" />
                  <span className="text-[13px] font-semibold text-amber-200">Target Gateway</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[12px]">
                  <div>
                    <span className="text-[var(--text-tertiary)]">Host:</span>{" "}
                    <span className="font-mono text-[var(--text-primary)]">{status.gateway_host}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)]">Status:</span>{" "}
                    <span className={status.gateway_status === "online" ? "text-emerald-400" : "text-red-400"}>
                      {status.gateway_status}
                    </span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)]">Sessions:</span>{" "}
                    <span className="text-[var(--text-primary)]">{status.session_count ?? "?"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)]">Running:</span>{" "}
                    <span className="font-semibold text-red-300">{status.running_sessions ?? "?"}</span>
                  </div>
                  <div>
                    <span className="text-[var(--text-tertiary)]">Agents:</span>{" "}
                    <span className="text-[var(--text-primary)]">{status.agent_count ?? "?"}</span>
                  </div>
                </div>
                {status.agents && status.agents.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {status.agents.map((a) => (
                      <span
                        key={a.id}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          a.is_default
                            ? "bg-amber-500/15 text-amber-300"
                            : "bg-white/5 text-[var(--text-tertiary)]"
                        }`}
                      >
                        {a.id}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Warning box */}
              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-red-400 mt-0.5" />
                  <div className="text-[12px] text-red-300/90 space-y-1">
                    <p className="font-semibold">This will IMMEDIATELY:</p>
                    <ul className="list-disc pl-4 space-y-0.5">
                      <li>Stop the entire OpenCLAW gateway service</li>
                      <li>Kill ALL running sessions ({status.running_sessions ?? "?"} active)</li>
                      <li>Take ALL agents offline ({status.agent_count ?? "?"} registered)</li>
                      <li>Disconnect all channels (Telegram, Discord, Slack)</li>
                    </ul>
                    <p className="mt-2 font-semibold text-amber-300">Manual restart required after this action.</p>
                  </div>
                </div>
              </div>

              {/* Reason field */}
              <div className="mb-4">
                <label htmlFor="nuclear-reason" className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
                  Reason (optional)
                </label>
                <input
                  id="nuclear-reason"
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Agent downloading unauthorized content"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-amber-500/40"
                />
              </div>

              {/* Double-confirmation */}
              <div className="mb-4">
                <label htmlFor="nuclear-confirm" className="mb-1.5 block text-[11px] font-bold text-amber-300">
                  Type STOP to confirm nuclear shutdown
                </label>
                <input
                  ref={inputRef}
                  id="nuclear-confirm"
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                  onKeyDown={(e) => { if (e.key === "Enter" && confirmText === "STOP") handleExecute(); }}
                  placeholder="STOP"
                  className="w-full rounded-xl border-2 border-amber-500/30 bg-[var(--bg-primary)] px-3 py-2.5 font-mono text-[15px] font-bold tracking-[0.3em] text-amber-200 outline-none placeholder:text-[var(--text-tertiary)] placeholder:tracking-[0.3em] focus:border-amber-500/60"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleExecute}
                  disabled={confirmText !== "STOP"}
                  className="flex items-center gap-2 rounded-xl border-2 border-amber-500/50 bg-amber-600/20 px-5 py-2.5 text-[13px] font-bold text-amber-200 transition hover:bg-amber-600/35 disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Power className="h-4 w-4" />
                  Nuclear Stop
                </button>
              </div>
            </>
          )}

          {/* Executing phase */}
          {phase === "executing" && (
            <div className="flex flex-col items-center justify-center gap-4 py-10">
              <div className="relative">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                <span className="absolute inset-0 animate-ping rounded-full border-2 border-amber-500/30" />
              </div>
              <div className="text-center">
                <p className="text-[14px] font-semibold text-amber-200">Executing Nuclear Stop...</p>
                <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">Stopping gateway and verifying shutdown</p>
              </div>
            </div>
          )}

          {/* Result phase */}
          {phase === "result" && result && (
            <>
              <div className={`mb-4 rounded-xl border p-4 ${
                result.ok && result.verified_down
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : result.ok
                  ? "border-amber-500/30 bg-amber-500/5"
                  : "border-red-500/30 bg-red-500/5"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {result.ok && result.verified_down ? (
                    <span className="text-[14px] font-bold text-emerald-300">Gateway Stopped & Verified Down</span>
                  ) : result.ok ? (
                    <span className="text-[14px] font-bold text-amber-300">Stop Sent — Verification Inconclusive</span>
                  ) : (
                    <span className="text-[14px] font-bold text-red-300">Nuclear Stop Failed</span>
                  )}
                </div>
                <div className="space-y-1 text-[12px] text-[var(--text-secondary)]">
                  <p>Host: <span className="font-mono">{result.gateway_host}</span></p>
                  <p>Method: <span className="font-mono">{result.method}</span></p>
                  {result.pre_stop_snapshot && (
                    <p>
                      Destroyed: {result.pre_stop_snapshot.session_count} sessions,{" "}
                      {result.pre_stop_snapshot.running_sessions} running,{" "}
                      {result.pre_stop_snapshot.agent_count} agents
                    </p>
                  )}
                  {result.detail && <p className="mt-1 text-[var(--text-tertiary)]">{result.detail}</p>}
                </div>
              </div>

              {result.ok && (
                <RestartGatewayButton gatewayHost={result.gateway_host} />
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-[var(--border)] px-5 py-2.5 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03]"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Restart button — usable both inside the nuclear stop modal and standalone */
export function RestartGatewayButton({ gatewayHost }: { gatewayHost?: string }) {
  const [state, setState] = useState<"idle" | "restarting" | "success" | "error">("idle");
  const [detail, setDetail] = useState("");

  const handleRestart = useCallback(async () => {
    setState("restarting");
    setDetail("");

    try {
      const res = await fetch("/api/gateway/restart-gateway", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason: "Restart from Arkon UI" }),
      });
      const data = await res.json();
      if (data.ok && data.verified_up) {
        setState("success");
        setDetail(data.detail ?? "Gateway is back online");
      } else if (data.ok) {
        setState("success");
        setDetail(data.detail ?? "Restart sent — gateway may still be starting");
      } else {
        setState("error");
        setDetail(data.detail ?? data.error ?? "Restart failed");
      }
    } catch {
      setState("error");
      setDetail("Cannot reach Arkon API");
    }
  }, []);

  return (
    <div className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
      {state === "idle" && (
        <>
          <p className="mb-2 text-[12px] text-[var(--text-secondary)]">
            Gateway {gatewayHost ? <code className="font-mono text-amber-300">{gatewayHost}</code> : ""} is stopped.
          </p>
          <button
            type="button"
            onClick={handleRestart}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/15 py-2.5 text-[13px] font-semibold text-emerald-200 transition hover:bg-emerald-600/25"
          >
            <RotateCcw className="h-4 w-4" />
            Restart Gateway
          </button>
        </>
      )}

      {state === "restarting" && (
        <div className="flex items-center justify-center gap-3 py-2">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
          <span className="text-[13px] text-emerald-300">Restarting gateway...</span>
        </div>
      )}

      {state === "success" && (
        <div className="flex items-center gap-2 py-1">
          <div className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <span className="text-[13px] font-semibold text-emerald-300">{detail}</span>
        </div>
      )}

      {state === "error" && (
        <>
          <p className="mb-2 text-[12px] text-red-300">{detail}</p>
          <button
            type="button"
            onClick={handleRestart}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-600/10 py-2 text-[12px] font-semibold text-red-200 transition hover:bg-red-600/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Retry
          </button>
        </>
      )}
    </div>
  );
}
