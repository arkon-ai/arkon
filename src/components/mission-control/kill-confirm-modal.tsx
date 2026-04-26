"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  OctagonX,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import type { KillVerification } from "@/hooks/use-active-runs";
import { formatDuration } from "@/lib/time-format";

interface ActiveRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
  started_at: string;
  current_action: string;
  status: "running" | "paused";
}

/** Result from the kill operation, including verification */
interface KillResult {
  ok: boolean;
  detail: string;
  method: string;
  sessions: { session_key: string; label: string; ok: boolean; detail: string }[];
  verification: KillVerification;
}

type Phase = "confirm" | "killing" | "verifying" | "result";

export function KillConfirmModal({
  run,
  onConfirm,
  onCancel,
}: {
  run: ActiveRun;
  onConfirm: (reason: string) => Promise<KillResult | boolean>;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [phase, setPhase] = useState<Phase>("confirm");
  const [result, setResult] = useState<KillResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (phase === "confirm" || phase === "result")) onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel, phase]);

  // Auto-close 4s after verified dead
  useEffect(() => {
    return () => {
      if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    };
  }, []);

  const handleConfirm = useCallback(async () => {
    setPhase("killing");

    let response: KillResult | boolean | undefined;
    try {
      response = await onConfirm(reason);
      console.log("[kill-modal] onConfirm response:", typeof response, response);
    } catch (err) {
      console.error("[kill-modal] onConfirm threw:", err);
      setResult({
        ok: false,
        detail: `Kill request failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        method: "error",
        sessions: [],
        verification: {
          verified_dead: false,
          remaining_sessions: -1,
          verification_method: "failed",
          detail: String(err),
        },
      });
      setPhase("result");
      return;
    }

    // Handle the response — could be KillResult object or boolean (sub-agent runs)
    if (typeof response === "boolean") {
      // Sub-agent kill — simple ok/fail, no verification
      setResult({
        ok: response,
        detail: response ? "Agent terminated" : "Kill failed",
        method: "sub-agent",
        sessions: [],
        verification: {
          verified_dead: response,
          remaining_sessions: response ? 0 : -1,
          verification_method: "skipped",
          detail: response ? "Sub-agent removed" : "Sub-agent kill failed",
        },
      });
      setPhase("result");
      if (response) {
        autoCloseRef.current = setTimeout(onCancel, 3000);
      }
      return;
    }

    // Main agent kill — has full verification data
    if (response && typeof response === "object") {
      setPhase("verifying");
      // Brief pause to show "Verifying..." state (verification already happened server-side)
      await new Promise((r) => setTimeout(r, 800));
      setResult(response as KillResult);
      setPhase("result");

      if ((response as KillResult).verification?.verified_dead) {
        autoCloseRef.current = setTimeout(onCancel, 4000);
      }
    } else {
      // Unexpected response (undefined, null, etc.)
      console.warn("[kill-modal] Unexpected response type:", typeof response, response);
      setResult({
        ok: false,
        detail: "Unexpected response from kill endpoint",
        method: "unknown",
        sessions: [],
        verification: {
          verified_dead: false,
          remaining_sessions: -1,
          verification_method: "failed",
          detail: "No response data",
        },
      });
      setPhase("result");
    }
  }, [reason, onConfirm, onCancel]);

  const isVerifiedDead = result?.verification?.verified_dead === true;
  const isKillOk = result?.ok === true;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={phase === "confirm" || phase === "result" ? onCancel : undefined}
        role="button"
        aria-label="Close"
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key === "Escape" && (phase === "confirm" || phase === "result")) onCancel();
        }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-[var(--bg-surface)] p-6 shadow-[0_20px_60px_rgba(220,38,38,0.15)]">
        {/* ── Phase: Confirm ── */}
        {phase === "confirm" && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10">
                <AlertTriangle className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Kill Agent</h3>
                <p className="text-[12px] text-[var(--text-secondary)]">This action cannot be undone</p>
              </div>
            </div>

            <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
              <p className="text-[13px] text-[var(--text-secondary)]">
                This will immediately terminate{" "}
                <span className="font-semibold text-[var(--text-primary)]">{run.agent_name}</span>&apos;s
                current action and verify it&apos;s dead.
              </p>
              <div className="mt-2 space-y-1 text-[12px] text-[var(--text-secondary)]">
                <p>
                  Currently running:{" "}
                  <span className="text-[var(--text-secondary)]">{run.current_action}</span>
                </p>
                <p>
                  Duration:{" "}
                  <span className="text-[var(--text-secondary)]">{formatDuration(run.started_at)}</span>
                </p>
              </div>
              <p className="mt-2 text-[11px] text-amber-400/70">
                Any in-progress changes may be incomplete.
              </p>
            </div>

            <div className="mb-4">
              <label
                htmlFor="kill-reason"
                className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]"
              >
                Reason (optional)
              </label>
              <input
                ref={inputRef}
                id="kill-reason"
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                placeholder="e.g. Agent producing incorrect outputs"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-red-500/40"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-600/20 px-4 py-2 text-[13px] font-semibold text-red-200 transition hover:bg-red-600/40"
              >
                <OctagonX className="h-3.5 w-3.5" />
                Kill Agent
              </button>
            </div>
          </>
        )}

        {/* ── Phase: Killing ── */}
        {phase === "killing" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
              <Loader2 className="h-7 w-7 animate-spin text-red-400" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Killing {run.agent_name}...
              </h3>
              <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                Aborting running sessions via gateway SSH
              </p>
            </div>
          </div>
        )}

        {/* ── Phase: Verifying ── */}
        {phase === "verifying" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
              <ShieldCheck className="h-7 w-7 animate-pulse text-amber-400" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Verifying Kill...
              </h3>
              <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                Checking gateway to confirm agent is dead
              </p>
            </div>
          </div>
        )}

        {/* ── Phase: Result ── */}
        {phase === "result" && result && (
          <>
            {/* Result icon + status */}
            <div className="flex flex-col items-center gap-3 pb-4">
              {isVerifiedDead ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10">
                    <CheckCircle2 className="h-7 w-7 text-emerald-400" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-emerald-300">
                      Confirmed Dead
                    </h3>
                    <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                      {result.verification.detail}
                    </p>
                  </div>
                </>
              ) : isKillOk ? (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10">
                    <ShieldAlert className="h-7 w-7 text-amber-400" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-amber-300">
                      Kill Sent — Verification Inconclusive
                    </h3>
                    <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                      {result.verification.detail}
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
                    <XCircle className="h-7 w-7 text-red-400" />
                  </div>
                  <div className="text-center">
                    <h3 className="text-sm font-semibold text-red-300">
                      Kill Failed
                    </h3>
                    <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                      {result.detail}
                    </p>
                  </div>
                </>
              )}
            </div>

            {/* Session abort details */}
            {result.sessions.length > 0 && (
              <div className="mb-4 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                  Sessions
                </p>
                <div className="space-y-1.5">
                  {result.sessions.map((s) => (
                    <div key={s.session_key} className="flex items-center gap-2 text-[12px]">
                      {s.ok ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                      ) : (
                        <XCircle className="h-3 w-3 shrink-0 text-red-400" />
                      )}
                      <span className="truncate text-[var(--text-secondary)]">{s.label}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-[var(--text-tertiary)]">
                        {s.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification badge */}
            {result.verification.verification_method !== "skipped" && (
              <div
                className={`mb-4 rounded-xl border p-2.5 text-center text-[11px] font-medium ${
                  isVerifiedDead
                    ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-400"
                    : "border-amber-500/20 bg-amber-500/5 text-amber-400"
                }`}
              >
                {isVerifiedDead ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verified via session recheck — 0 running sessions
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" />
                    {result.verification.remaining_sessions > 0
                      ? `${result.verification.remaining_sessions} session(s) still running — check gateway`
                      : "Verification could not confirm kill"}
                  </span>
                )}
              </div>
            )}

            {/* Close / auto-close indicator */}
            <div className="flex items-center justify-end gap-2">
              {isVerifiedDead && (
                <span className="text-[10px] text-[var(--text-tertiary)]">
                  Auto-closing...
                </span>
              )}
              <button
                type="button"
                onClick={onCancel}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
              >
                {isVerifiedDead ? "Close" : "Dismiss"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
