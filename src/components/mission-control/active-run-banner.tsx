"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OctagonX, Pause, Play, ChevronDown, Zap } from "lucide-react";
import { KillConfirmModal } from "./kill-confirm-modal";
import { formatDuration } from "@/lib/time-format";

interface ActiveRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
  started_at: string;
  current_action: string;
  source_channel: string | null;
  model: string | null;
  status: "running" | "paused";
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}


export function ActiveRunBanner() {
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [killTarget, setKillTarget] = useState<ActiveRun | null>(null);
  const [, setTick] = useState(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Poll for active runs
  useEffect(() => {
    let mounted = true;

    const poll = async () => {
      try {
        const res = await fetch("/api/active-runs", {
          headers: getAuthHeaders(),
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { runs: ActiveRun[] };
        if (mounted) {
          setRuns(data.runs);
          // Un-dismiss if new runs appear
          if (data.runs.length > 0 && dismissed) setDismissed(false);
        }
      } catch {
        // Silent
      }
    };

    poll();
    const timer = setInterval(poll, 5000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [dismissed]);

  // Live timer tick every second
  useEffect(() => {
    if (runs.length === 0) return;
    const timer = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(timer);
  }, [runs.length]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    // Auto-undismiss after 5 minutes
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    dismissTimer.current = setTimeout(() => setDismissed(false), 5 * 60 * 1000);
  }, []);

  const handlePause = useCallback(async (runId: string) => {
    try {
      await fetch(`/api/tools/agents-live/${runId}/pause`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      setRuns((prev) =>
        prev.map((r) => (r.run_id === runId ? { ...r, status: "paused" as const } : r))
      );
    } catch {
      // Silent
    }
  }, []);

  const handleResume = useCallback(async (runId: string) => {
    try {
      await fetch(`/api/tools/agents-live/${runId}/resume`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      setRuns((prev) =>
        prev.map((r) => (r.run_id === runId ? { ...r, status: "running" as const } : r))
      );
    } catch {
      // Silent
    }
  }, []);

  const handleKillConfirm = useCallback(
    async (reason: string): Promise<boolean> => {
      if (!killTarget) return false;
      try {
        const res = await fetch(`/api/tools/agents-live/${killTarget.run_id}/kill`, {
          method: "POST",
          headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ reason: reason || undefined }),
        });
        setRuns((prev) => prev.filter((r) => r.run_id !== killTarget.run_id));
        setKillTarget(null);
        return res.ok;
      } catch {
        return false;
      }
    },
    [killTarget]
  );

  if (runs.length === 0 || dismissed) return null;

  const primary = runs[0];
  const hasMultiple = runs.length > 1;

  return (
    <>
      <div className="border-b border-danger/30 bg-gradient-to-r from-danger/40 via-danger/20 to-danger/40">
        <div className="flex items-center gap-3 px-4 py-2 sm:px-6">
          {/* Pulsing indicator */}
          <div className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
          </div>

          {/* Run info */}
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <Zap className="h-3.5 w-3.5 shrink-0 text-danger" />
            <span className="truncate text-[13px] font-medium text-danger">
              <span className="font-semibold text-danger">{primary.agent_name}</span>
              {primary.status === "paused" ? (
                <span className="ml-1.5 text-warning">(paused)</span>
              ) : null}
              <span className="mx-1.5 text-danger/60">&middot;</span>
              <span className="text-danger/80">{formatDuration(primary.started_at)}</span>
              <span className="mx-1.5 text-danger/60">&middot;</span>
              <span className="text-danger/60">{primary.current_action}</span>
            </span>

            {hasMultiple ? (
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 rounded-lg border border-danger/20 bg-danger/10 px-2 py-0.5 text-[11px] font-medium text-danger transition hover:bg-danger/20"
              >
                +{runs.length - 1} more
                <ChevronDown
                  className={`h-3 w-3 transition-transform ${expanded ? "rotate-180" : ""}`}
                />
              </button>
            ) : null}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1.5">
            {primary.status === "running" ? (
              <button
                type="button"
                onClick={() => handlePause(primary.run_id)}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-warning/30 bg-warning/10 px-2.5 text-[11px] font-semibold text-warning transition hover:bg-warning/20"
                title="Pause agent"
              >
                <Pause className="h-3 w-3" />
                <span className="hidden sm:inline">Pause</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleResume(primary.run_id)}
                className="flex h-7 items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-2.5 text-[11px] font-semibold text-success transition hover:bg-success/20"
                title="Resume agent"
              >
                <Play className="h-3 w-3" />
                <span className="hidden sm:inline">Resume</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setKillTarget(primary)}
              className="flex h-7 items-center gap-1.5 rounded-lg border border-danger/40 bg-danger/20 px-3 text-[11px] font-bold uppercase tracking-wide text-danger transition hover:bg-danger/40"
            >
              <OctagonX className="h-3.5 w-3.5" />
              Kill
            </button>

            <button
              type="button"
              onClick={handleDismiss}
              className="ml-1 text-[11px] text-danger/50 transition hover:text-danger"
              title="Dismiss for 5 minutes"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Expanded: show all runs */}
        {expanded && hasMultiple ? (
          <div className="border-t border-danger/20 px-4 py-1.5 sm:px-6">
            {runs.slice(1).map((run) => (
              <div
                key={run.run_id}
                className="flex items-center gap-3 py-1.5"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-danger/60" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-danger/70">
                  <span className="font-medium text-danger">{run.agent_name}</span>
                  {run.status === "paused" ? (
                    <span className="ml-1 text-warning">(paused)</span>
                  ) : null}
                  <span className="mx-1.5 text-danger/40">&middot;</span>
                  {formatDuration(run.started_at)}
                  <span className="mx-1.5 text-danger/40">&middot;</span>
                  {run.current_action}
                </span>
                <div className="flex items-center gap-1">
                  {run.status === "running" ? (
                    <button
                      type="button"
                      onClick={() => handlePause(run.run_id)}
                      className="rounded p-1 text-warning/60 transition hover:bg-warning/10 hover:text-warning"
                      title="Pause"
                    >
                      <Pause className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleResume(run.run_id)}
                      className="rounded p-1 text-success/60 transition hover:bg-success/10 hover:text-success"
                      title="Resume"
                    >
                      <Play className="h-3 w-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setKillTarget(run)}
                    className="rounded p-1 text-danger/60 transition hover:bg-danger/10 hover:text-danger"
                    title="Kill"
                  >
                    <OctagonX className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
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
