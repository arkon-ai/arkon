"use client";

import { useCallback, useEffect, useState } from "react";
import { OctagonX } from "lucide-react";
import { useActiveRuns } from "@/hooks/use-active-runs";
import { KillConfirmModal } from "./kill-confirm-modal";

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime();
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function MobileKillBar() {
  const { runs, killRun } = useActiveRuns(undefined, 5000);
  const [killTarget, setKillTarget] = useState<(typeof runs)[0] | null>(null);
  const [, setTick] = useState(0);

  // Live timer tick
  useEffect(() => {
    if (runs.length === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [runs.length]);

  const handleKillConfirm = useCallback(
    async (reason: string) => {
      if (!killTarget) return;
      await killRun(killTarget.run_id, reason || undefined);
      setKillTarget(null);
    },
    [killTarget, killRun]
  );

  if (runs.length === 0) return null;

  const primary = runs[0];

  return (
    <>
      {/* Persistent bar above mobile bottom nav */}
      <div className="fixed inset-x-0 bottom-[calc(56px+max(env(safe-area-inset-bottom),4px))] z-[49] md:hidden">
        <button
          type="button"
          onClick={() => setKillTarget(primary)}
          className="flex w-full items-center justify-between gap-3 bg-red-700 px-4 py-2.5 text-white active:bg-red-800 transition-colors touch-manipulation"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <div className="relative flex h-2 w-2 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </div>
            <span className="truncate text-[13px] font-semibold">
              {primary.agent_name}
            </span>
            <span className="text-[12px] font-medium text-red-200">
              {formatDuration(primary.started_at)}
            </span>
            {runs.length > 1 && (
              <span className="rounded-full bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold text-red-200">
                +{runs.length - 1}
              </span>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 rounded-lg bg-red-900/60 px-3 py-1.5 text-[12px] font-bold uppercase tracking-wide">
            <OctagonX className="h-4 w-4" />
            Stop
          </div>
        </button>
      </div>

      {killTarget ? (
        <KillConfirmModal
          run={killTarget}
          onConfirm={handleKillConfirm}
          onCancel={() => setKillTarget(null)}
        />
      ) : null}
    </>
  );
}
