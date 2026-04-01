"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OctagonX, AlertTriangle } from "lucide-react";

interface ActiveRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
  started_at: string;
  current_action: string;
  status: "running" | "paused";
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function KillConfirmModal({
  run,
  onConfirm,
  onCancel,
}: {
  run: ActiveRun;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onCancel]);

  const handleConfirm = useCallback(async () => {
    setLoading(true);
    await onConfirm(reason);
    setLoading(false);
  }, [reason, onConfirm]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onCancel}
        role="button"
        aria-label="Close"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-red-500/30 bg-[var(--bg-surface)] p-6 shadow-[0_20px_60px_rgba(220,38,38,0.15)]">
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
            current action.
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
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-600/20 px-4 py-2 text-[13px] font-semibold text-red-200 transition hover:bg-red-600/40 disabled:opacity-50"
          >
            <OctagonX className="h-3.5 w-3.5" />
            {loading ? "Killing..." : "Kill Agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
