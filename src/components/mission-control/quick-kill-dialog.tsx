"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OctagonX, Zap } from "lucide-react";
import { useActiveRuns, type ActiveRun } from "@/hooks/use-active-runs";

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function QuickKillDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { runs, killRun } = useActiveRuns(undefined, 3000);
  const [selected, setSelected] = useState(0);
  const [killing, setKilling] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset selection when opening or runs change
  useEffect(() => {
    if (open) setSelected(0);
  }, [open, runs.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelected((i) => Math.min(i + 1, runs.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelected((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && runs[selected]) {
        e.preventDefault();
        handleKill(runs[selected]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, runs, selected, onClose]);

  const handleKill = useCallback(
    async (run: ActiveRun) => {
      setKilling(true);
      await killRun(run.run_id, "Quick kill via Ctrl+Shift+K");
      setKilling(false);
      if (runs.length <= 1) onClose();
    },
    [killRun, runs.length, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[min(20vh,160px)]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        aria-label="Close"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-500/30 bg-[var(--bg-surface)] shadow-[0_20px_60px_rgba(220,38,38,0.15)]">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-red-500/20 px-4 py-3">
          <OctagonX className="h-4 w-4 text-red-400" />
          <span className="flex-1 text-sm font-semibold text-red-200">Quick Kill</span>
          <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
            ESC
          </kbd>
        </div>

        {/* Runs list */}
        <div ref={listRef} className="max-h-[300px] overflow-y-auto p-2">
          {runs.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--text-tertiary)]">
              No active runs to kill
            </div>
          ) : (
            runs.map((run, i) => (
              <button
                key={run.run_id}
                type="button"
                onClick={() => handleKill(run)}
                disabled={killing}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  i === selected
                    ? "bg-red-500/10 text-red-200"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.03]"
                } disabled:opacity-50`}
              >
                <div className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{run.agent_name}</span>
                    {run.status === "paused" && (
                      <span className="text-[10px] text-amber-400">(paused)</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[11px] text-[var(--text-secondary)]">
                    {run.current_action}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11px] font-medium text-red-300">
                    {formatDuration(run.started_at)}
                  </div>
                </div>
                {i === selected && (
                  <Zap className="h-3.5 w-3.5 shrink-0 text-red-400" />
                )}
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {runs.length > 0 && (
          <div className="flex items-center gap-4 border-t border-red-500/20 px-4 py-2 text-[10px] text-[var(--text-tertiary)]">
            <span>
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">&uarr;</kbd>{" "}
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">&darr;</kbd>{" "}
              select
            </span>
            <span>
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">Enter</kbd>{" "}
              kill
            </span>
            <span>
              <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">Esc</kbd>{" "}
              close
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
