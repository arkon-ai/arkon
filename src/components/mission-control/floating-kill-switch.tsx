"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OctagonX, Pause, Play, Zap, X, ChevronUp } from "lucide-react";
import { useActiveRuns, type ActiveRun } from "@/hooks/use-active-runs";
import { KillConfirmModal } from "./kill-confirm-modal";

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes % 60)}:${pad(seconds % 60)}`;
  return `${pad(minutes)}:${pad(seconds % 60)}`;
}

export function FloatingKillSwitch() {
  const { runs, killRun, pauseRun, resumeRun } = useActiveRuns(undefined, 3000);
  const [expanded, setExpanded] = useState(false);
  const [killTarget, setKillTarget] = useState<ActiveRun | null>(null);
  const [killingAll, setKillingAll] = useState(false);
  const [, setTick] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);

  // Live timer tick
  useEffect(() => {
    if (runs.length === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [runs.length]);

  // Close panel on click outside
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [expanded]);

  // Close panel on Escape
  useEffect(() => {
    if (!expanded) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [expanded]);

  // Auto-collapse when no runs
  useEffect(() => {
    if (runs.length === 0) setExpanded(false);
  }, [runs.length]);

  const handleKillConfirm = useCallback(
    async (reason: string) => {
      if (!killTarget) return;
      await killRun(killTarget.run_id, reason || undefined);
      setKillTarget(null);
    },
    [killTarget, killRun]
  );

  const handleKillAll = useCallback(async () => {
    setKillingAll(true);
    for (const run of runs) {
      await killRun(run.run_id, "Kill all via floating kill switch");
    }
    setKillingAll(false);
    setExpanded(false);
  }, [runs, killRun]);

  if (runs.length === 0) return null;

  const runningCount = runs.filter((r) => r.status === "running").length;
  const pausedCount = runs.filter((r) => r.status === "paused").length;

  return (
    <>
      <div
        ref={panelRef}
        className="fixed bottom-6 right-6 z-[90] flex flex-col items-end md:bottom-8 md:right-8"
      >
        {/* Expanded panel */}
        {expanded && (
          <div className="mb-3 w-[340px] overflow-hidden rounded-2xl border border-red-500/30 bg-[#111118] shadow-[0_20px_60px_rgba(220,38,38,0.2)]">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-red-500/20 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </div>
                <span className="text-[13px] font-semibold text-red-200">
                  Active Agents
                </span>
                <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-bold text-red-300">
                  {runs.length}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[#555566] transition hover:bg-white/[0.05] hover:text-[#8888A0]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Runs list */}
            <div className="max-h-[320px] overflow-y-auto">
              {runs.map((run) => (
                <div
                  key={run.run_id}
                  className="border-b border-[#1E1E2A]/50 px-4 py-3 transition hover:bg-white/[0.02]"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          run.status === "running" ? "bg-red-500" : "bg-amber-500"
                        }`}
                      />
                      <span className="truncate text-[13px] font-semibold text-[#E4E4ED]">
                        {run.agent_name}
                      </span>
                      {run.status === "paused" && (
                        <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-400">
                          Paused
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-[12px] tabular-nums text-red-300/80">
                      {formatDuration(run.started_at)}
                    </span>
                  </div>

                  <p className="mt-1 truncate text-[11px] text-[#555566]">
                    {run.current_action}
                  </p>

                  {/* Per-agent actions */}
                  <div className="mt-2 flex items-center gap-1.5">
                    {run.status === "running" ? (
                      <button
                        type="button"
                        onClick={() => pauseRun(run.run_id)}
                        className="flex h-6 items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/8 px-2 text-[10px] font-semibold text-amber-300 transition hover:bg-amber-500/15"
                      >
                        <Pause className="h-2.5 w-2.5" />
                        Pause
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => resumeRun(run.run_id)}
                        className="flex h-6 items-center gap-1 rounded-lg border border-green-500/25 bg-green-500/8 px-2 text-[10px] font-semibold text-green-300 transition hover:bg-green-500/15"
                      >
                        <Play className="h-2.5 w-2.5" />
                        Resume
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setKillTarget(run)}
                      className="flex h-6 items-center gap-1 rounded-lg border border-red-500/30 bg-red-600/15 px-2 text-[10px] font-bold text-red-300 transition hover:bg-red-600/30"
                    >
                      <OctagonX className="h-2.5 w-2.5" />
                      Kill
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Kill All footer */}
            {runs.length > 1 && (
              <div className="border-t border-red-500/20 p-3">
                <button
                  type="button"
                  onClick={handleKillAll}
                  disabled={killingAll}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/40 bg-red-600/20 py-2 text-[12px] font-bold uppercase tracking-wide text-red-200 transition hover:bg-red-600/35 disabled:opacity-50"
                >
                  <OctagonX className="h-3.5 w-3.5" />
                  {killingAll ? "Killing All..." : "Kill All Agents"}
                </button>
              </div>
            )}

            {/* Keyboard hint */}
            <div className="border-t border-[#1E1E2A]/50 px-4 py-2 text-center">
              <span className="text-[10px] text-[#555566]">
                <kbd className="rounded border border-[#1E1E2A] bg-[#0A0A0C] px-1 py-0.5 text-[9px] font-medium">
                  Ctrl+Shift+K
                </kbd>{" "}
                quick kill
              </span>
            </div>
          </div>
        )}

        {/* FAB button */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="group relative flex h-14 w-14 items-center justify-center rounded-full border border-red-500/50 bg-red-600/90 text-white shadow-[0_4px_20px_rgba(220,38,38,0.4)] transition-all hover:bg-red-600 hover:shadow-[0_4px_30px_rgba(220,38,38,0.6)] active:scale-95"
          aria-label={`${runs.length} active agent${runs.length !== 1 ? "s" : ""} — click to manage`}
        >
          {/* Pulsing ring */}
          <span className="absolute inset-0 rounded-full animate-ping border-2 border-red-500 opacity-30" />
          <span className="absolute inset-[-3px] rounded-full animate-pulse border border-red-500/40" />

          {expanded ? (
            <ChevronUp className="h-5 w-5 relative z-10" />
          ) : (
            <Zap className="h-5 w-5 relative z-10" />
          )}

          {/* Agent count badge */}
          <span className="absolute -right-1 -top-1 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 text-[10px] font-bold text-red-600 shadow-sm">
            {runs.length}
          </span>
        </button>

        {/* Status summary below FAB (collapsed state only) */}
        {!expanded && (
          <div className="mt-1.5 rounded-lg bg-[#111118]/90 border border-red-500/20 px-2.5 py-1 backdrop-blur">
            <p className="text-center text-[10px] font-medium text-red-300/80">
              {runningCount > 0 && `${runningCount} running`}
              {runningCount > 0 && pausedCount > 0 && " · "}
              {pausedCount > 0 && `${pausedCount} paused`}
            </p>
          </div>
        )}
      </div>

      {killTarget && (
        <KillConfirmModal
          run={killTarget}
          onConfirm={handleKillConfirm}
          onCancel={() => setKillTarget(null)}
        />
      )}
    </>
  );
}
