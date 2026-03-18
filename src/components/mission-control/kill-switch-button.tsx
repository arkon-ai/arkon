"use client";

import { useState } from "react";
import { OctagonX } from "lucide-react";
import { useActiveRuns } from "@/hooks/use-active-runs";
import { KillConfirmModal } from "./kill-confirm-modal";

export function KillSwitchButton() {
  const { runs, killRun } = useActiveRuns(undefined, 5000);
  const [killTarget, setKillTarget] = useState<(typeof runs)[0] | null>(null);

  const hasRuns = runs.length > 0;

  const handleClick = () => {
    if (hasRuns) {
      setKillTarget(runs[0]);
    }
  };

  const handleKillConfirm = async (reason: string) => {
    if (!killTarget) return;
    await killRun(killTarget.run_id, reason || undefined);
    setKillTarget(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={!hasRuns}
        title={hasRuns ? `Kill active agent (${runs.length} running)` : "No active agents"}
        className={`relative flex h-10 w-10 items-center justify-center rounded-xl border transition ${
          hasRuns
            ? "border-red-500/50 bg-red-600/20 text-red-400 hover:bg-red-600/30 hover:text-red-300"
            : "border-[#1a2a4a] bg-[#0d0d1a] text-[#334155] cursor-default"
        }`}
      >
        <OctagonX className="h-4.5 w-4.5" />
        {hasRuns && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {runs.length}
          </span>
        )}
      </button>

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
