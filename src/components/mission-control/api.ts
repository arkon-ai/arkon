"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface Tenant {
  id: string;
  name: string;
  domain: string | null;
  plan: string;
  created_at: string;
}

export interface OverviewAgent {
  id: string;
  name: string;
  tenant_id: string;
  metadata: Record<string, string | number | boolean | null>;
  last_active: string | null;
  events_24h: string;
  events_7d: string;
  events_total: string;
  tokens_24h: string;
  threats_30d: string;
  cost_30d: string;
}

export interface TodayStat {
  agent_id: string;
  tenant_id: string;
  received: string;
  sent: string;
  tools: string;
  errors: string;
  tokens: string;
}

export interface OverviewData {
  agents: OverviewAgent[];
  todayStats: TodayStat[];
  tenants: Tenant[];
  timestamp: string;
}

export interface AgentEvent {
  id: string;
  event_type: string;
  direction: string;
  session_key: string;
  channel_id: string;
  sender: string;
  content: string;
  content_redacted: boolean;
  metadata: Record<string, unknown>;
  token_estimate: number;
  created_at: string;
}

export interface AgentDetailData {
  agent: {
    id: string;
    name: string;
    metadata: Record<string, string>;
    created_at: string;
    updated_at?: string;
  };
  events: AgentEvent[];
  sessions: Array<{
    session_key: string;
    channel_id: string;
    last_active: string;
    message_count: number;
  }>;
  stats: Array<{
    day: string;
    messages_received: number;
    messages_sent: number;
    tool_calls: number;
    errors: number;
    estimated_tokens: number;
  }>;
  timestamp: string;
}

export interface TrendDay {
  day: string;
  received: number;
  sent: number;
  tools: number;
  errors: number;
  tokens: number;
}

export interface TrendData {
  trend: TrendDay[];
  totals: { received: number; sent: number; tools: number; errors: number; tokens: number };
  range: number;
  timestamp: string;
}

type State<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

function getCsrfToken(): string {
  if (typeof document === "undefined") return "";
  const match = document.cookie.match(/mc_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : "";
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const csrf = getCsrfToken();
  if (csrf) headers["x-csrf-token"] = csrf;
  return headers;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { ...getAuthHeaders() },
    cache: "no-store",
  });

  if (response.status === 401) {
    if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    throw new Error("Unauthorized");
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export function usePollingFetch<T>(url: string, intervalMs = 15000): State<T> {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const data = await fetchJson<T>(url);
        if (!mounted) return;
        setState({ data, error: null, loading: false });
      } catch (error) {
        if (!mounted) return;
        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
      }
    };

    run();
    const timer = typeof window !== "undefined" ? window.setInterval(run, intervalMs) : (0 as unknown as ReturnType<typeof setInterval>);
    return () => {
      mounted = false;
      if (typeof window !== "undefined") window.clearInterval(timer);
    };
  }, [intervalMs, url]);

  return state;
}

// SSE hook — connects to /api/dashboard/stream for real-time events
export function useEventStream(onEvent?: (event: { type: string; payload: Record<string, unknown> }) => void) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource("/api/dashboard/stream");
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        onEventRef.current?.(parsed);
      } catch {
        // ignore malformed messages
      }
    };

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      setConnected(false);
    };
  }, []);

  return { connected };
}

// SSE-enhanced polling: polls normally but triggers an immediate refresh when SSE event arrives
export function useLivePollingFetch<T>(url: string, intervalMs = 15000): State<T> & { connected: boolean } {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    loading: true,
  });
  const [connected, setConnected] = useState(false);
  const urlRef = useRef(url);
  urlRef.current = url;

  const refresh = useCallback(async () => {
    try {
      const data = await fetchJson<T>(urlRef.current);
      setState({ data, error: null, loading: false });
    } catch (error) {
      setState((current) => ({
        data: current.data,
        error: error instanceof Error ? error.message : "Request failed",
        loading: false,
      }));
    }
  }, []);

  // SSE connection
  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource("/api/dashboard/stream");
    es.onopen = () => setConnected(true);
    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.type === "event") {
          // New event ingested — refresh dashboard data
          void refresh();
        }
      } catch {
        // ignore
      }
    };
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, [refresh]);

  // Regular polling as fallback
  useEffect(() => {
    if (typeof window === "undefined") return;
    void refresh();
    const timer = window.setInterval(refresh, intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, refresh]);

  return { ...state, connected };
}

export function useOverviewData() {
  return useLivePollingFetch<OverviewData>("/api/dashboard/overview");
}

export function useAgentDetailData(id: string) {
  return usePollingFetch<AgentDetailData>(`/api/dashboard/agent/${id}`);
}

export function useTrendData(range: "7d" | "30d" = "7d", tenantId?: string) {
  const params = new URLSearchParams({ range });
  if (tenantId) params.set("tenant_id", tenantId);
  return usePollingFetch<TrendData>(`/api/dashboard/trends?${params}`, 60000);
}

export function asNumber(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  return Number.parseInt(value ?? "0", 10) || 0;
}

export function formatCompact(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value);
}

export function formatFull(value: number) {
  return new Intl.NumberFormat("en").format(value);
}

export function timeAgo(dateStr: string | null) {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function activityStatus(lastActive: string | null) {
  if (!lastActive) {
    return { label: "Offline", dot: "bg-red", tone: "text-red", panel: "border-red/40" };
  }
  const diff = Date.now() - new Date(lastActive).getTime();
  if (diff < 5 * 60 * 1000) {
    return { label: "Live", dot: "bg-green animate-pulse", tone: "text-green", panel: "border-green/40" };
  }
  if (diff < 60 * 60 * 1000) {
    return { label: "Warm", dot: "bg-amber", tone: "text-amber", panel: "border-amber/40" };
  }
  return { label: "Idle", dot: "bg-text-dim", tone: "text-text-dim", panel: "border-border" };
}

export function getOverviewMetrics(data: OverviewData | null) {
  const agents = data?.agents ?? [];
  const todayStats = data?.todayStats ?? [];

  const totals = agents.reduce(
    (acc, agent) => {
      acc.events24h += asNumber(agent.events_24h);
      acc.events7d += asNumber(agent.events_7d);
      acc.tokens24h += asNumber(agent.tokens_24h);
      return acc;
    },
    { events24h: 0, events7d: 0, tokens24h: 0 }
  );

  const activeAgents = agents.filter(
    (agent) => Date.now() - new Date(agent.last_active ?? 0).getTime() < 60 * 60 * 1000
  ).length;
  const errorsToday = todayStats.reduce((sum, item) => sum + asNumber(item.errors), 0);
  const toolsToday = todayStats.reduce((sum, item) => sum + asNumber(item.tools), 0);

  return { totalAgents: agents.length, activeAgents, errorsToday, toolsToday, ...totals };
}
