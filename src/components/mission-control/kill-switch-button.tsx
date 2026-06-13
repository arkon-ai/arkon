"use client";

import { useState, useCallback } from "react";
import { OctagonX } from "lucide-react";
import { useActiveRuns, type ActiveRun } from "@/hooks/use-active-runs";
import { KillConfirmModal } from "./kill-confirm-modal";

export function KillSwitchButton() {
  const { runs, killRun } = useActiveRuns(undefined, 5000);
  const [killTarget, setKillTarget] = useState<ActiveRun | null>(null);

  const hasRuns = runs.length > 0;

  const handleClick = useCallback(() => {
    if (runs.length > 0) {
      setKillTarget(runs[0]);
    }
  }, [runs]);

  const handleKillConfirm = useCallback(async (reason: string) => {
    if (!killTarget) return false;
    const result = await killRun(killTarget.run_id, reason || undefined);
    setKillTarget(null);
    return result;
  }, [killTarget, killRun]);

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={!hasRuns}
        title={hasRuns ? `Kill active agent (${runs.length} running)` : "No active agents"}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
          hasRuns
            ? "border-danger/50 bg-danger/20 text-danger hover:bg-danger/30 hover:text-danger animate-pulse"
            : "border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-secondary)] cursor-default"
        }`}
      >
        <OctagonX className="h-4 w-4" />
        {hasRuns ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {runs.length}
          </span>
        ) : null}
      </button>

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
