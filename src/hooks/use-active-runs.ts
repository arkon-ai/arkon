"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface ActiveRun {
  run_id: string;
  agent_id: string;
  agent_name: string;
  started_at: string;
  current_action: string;
  source_channel: string | null;
  model: string | null;
  status: "running" | "paused";
  /** true = main agent (from agents table), false = sub-agent run (from subagent_runs) */
  is_main_agent?: boolean;
}

/** Kill verification result from the kill-agent API */
export interface KillVerification {
  verified_dead: boolean;
  remaining_sessions: number;
  verification_method: "session-recheck" | "skipped" | "failed";
  detail: string;
}

/** Full kill response from POST /api/gateway/kill-agent */
export interface KillResponse {
  ok: boolean;
  agent_id: string;
  agent_name: string;
  method: string;
  detail: string;
  sessions: { session_key: string; label: string; ok: boolean; detail: string }[];
  verification: KillVerification;
  reason: string | null;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

/** Burst polling duration (ms) — after a kill, poll fast for this long */
const BURST_DURATION_MS = 10_000;
/** Burst polling interval (ms) */
const BURST_INTERVAL_MS = 1_000;

export function useActiveRuns(agentId?: string, pollInterval = 5000) {
  const [runs, setRuns] = useState<ActiveRun[]>([]);
  const burstUntilRef = useRef<number>(0);
  const mountedRef = useRef(true);

  const poll = useCallback(async () => {
    try {
      const url = agentId
        ? `/api/active-runs?agent_id=${agentId}`
        : "/api/active-runs";
      const res = await fetch(url, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { runs: ActiveRun[] };
      if (mountedRef.current) setRuns(data.runs);
    } catch {
      // Silent
    }
  }, [agentId]);

  useEffect(() => {
    mountedRef.current = true;

    poll();

    // Dynamic interval: use burst rate if within burst window, else normal
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const isBursting = Date.now() < burstUntilRef.current;
      const interval = isBursting ? BURST_INTERVAL_MS : pollInterval;
      timer = setTimeout(async () => {
        await poll();
        if (mountedRef.current) schedule();
      }, interval);
    };
    schedule();

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [agentId, pollInterval, poll]);

  /** Trigger burst polling (1s intervals for 10s) to quickly reflect kill results */
  const triggerBurstPoll = useCallback(() => {
    burstUntilRef.current = Date.now() + BURST_DURATION_MS;
  }, []);

  const killRun = useCallback(async (runId: string, reason?: string): Promise<KillResponse | boolean> => {
    // Main agents use agent:id format — kill via gateway proxy
    if (runId.startsWith("agent:")) {
      const agentIdFromRun = runId.replace("agent:", "");
      const res = await fetch("/api/gateway/kill-agent", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentIdFromRun, reason: reason || undefined }),
      });
      if (res.ok) {
        const data = (await res.json()) as KillResponse;
        // Don't eagerly remove from local state — let the modal complete its
        // phase transitions first. Burst polling will update the list naturally.
        triggerBurstPoll();
        return data;
      }
      return false;
    }

    // Sub-agent runs — existing kill endpoint
    const res = await fetch(`/api/tools/agents-live/${runId}/kill`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    if (res.ok) {
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
      triggerBurstPoll();
    }
    return res.ok;
  }, [triggerBurstPoll]);

  const pauseRun = useCallback(async (runId: string) => {
    if (runId.startsWith("agent:")) {
      // Main agents — pause not supported yet
      return false;
    }
    const res = await fetch(`/api/tools/agents-live/${runId}/pause`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      setRuns((prev) =>
        prev.map((r) => (r.run_id === runId ? { ...r, status: "paused" as const } : r))
      );
    }
    return res.ok;
  }, []);

  const resumeRun = useCallback(async (runId: string) => {
    if (runId.startsWith("agent:")) {
      return false;
    }
    const res = await fetch(`/api/tools/agents-live/${runId}/resume`, {
      method: "POST",
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      setRuns((prev) =>
        prev.map((r) => (r.run_id === runId ? { ...r, status: "running" as const } : r))
      );
    }
    return res.ok;
  }, []);

  return { runs, killRun, pauseRun, resumeRun, triggerBurstPoll };
}
