"use client";

import { useCallback, useEffect, useState } from "react";

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

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

export function useActiveRuns(agentId?: string, pollInterval = 5000) {
  const [runs, setRuns] = useState<ActiveRun[]>([]);

  useEffect(() => {
    let mounted = true;

    const poll = async () => {
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
        if (mounted) setRuns(data.runs);
      } catch {
        // Silent
      }
    };

    poll();
    const timer = setInterval(poll, pollInterval);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [agentId, pollInterval]);

  const killRun = useCallback(async (runId: string, reason?: string) => {
    // Main agents use agent:id format — kill via gateway proxy
    if (runId.startsWith("agent:")) {
      const agentIdFromRun = runId.replace("agent:", "");
      const res = await fetch("/api/gateway/kill-agent", {
        method: "POST",
        headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ agent_id: agentIdFromRun, reason: reason || undefined }),
      });
      if (res.ok) {
        setRuns((prev) => prev.filter((r) => r.run_id !== runId));
      }
      return res.ok;
    }

    // Sub-agent runs — existing kill endpoint
    const res = await fetch(`/api/tools/agents-live/${runId}/kill`, {
      method: "POST",
      headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reason || undefined }),
    });
    if (res.ok) {
      setRuns((prev) => prev.filter((r) => r.run_id !== runId));
    }
    return res.ok;
  }, []);

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

  return { runs, killRun, pauseRun, resumeRun };
}
