"use client";

import { Bot } from "lucide-react";
import { StatusRing, SkeletonCard } from "./charts";
import {
  Card,
  ErrorState,
  SectionTitle,
  ShellHeader,
} from "./dashboard";
import { SectionDescription } from "./dashboard-clarity";
import { EmptyState } from "./empty-states";
import {
  activityStatus,
  timeAgo,
  useLivePollingFetch,
} from "./api";

type FleetSlug = "warden" | "codesmith" | "lumina" | "sentinel";
type StatusKey = "live" | "warm" | "idle" | "error";

interface FleetAgent {
  identity: {
    slug: FleetSlug;
    display_name: string;
    emoji: string | null;
    model: string | null;
    home_server: string | null;
    description: string | null;
    harness: string | null;
    role: string;
  };
  activity: {
    last_heartbeat: string | null;
    last_activity: string | null;
    started_24h: number;
    completed_24h: number;
    events_24h: number;
    recent_events: Array<{
      event_type: string;
      ts: string;
      payload: Record<string, unknown>;
      status: string | null;
      duration_ms: number | null;
    }>;
  };
  delegations: {
    seven_day: Array<{ status: string; count: number }>;
  };
  messages: Array<{ id: string; preview: string; created_at: string }>;
  work_entries: Array<{
    id: string;
    title: string;
    status: string;
    priority: number;
    category: string;
    occurred_at: string;
    related_project: string | null;
  }>;
}

interface FleetData {
  agents: FleetAgent[];
  attribution_cutoff: string;
  timestamp: string;
}

function statusKeyFor(lastActive: string | null): StatusKey {
  const label = activityStatus(lastActive).label;
  if (label === "Live") return "live";
  if (label === "Warm") return "warm";
  if (label === "Offline") return "error";
  return "idle";
}

function formatAttributionCutoff(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";
}

export function FleetScreen() {
  const { data, error, loading, connected } = useLivePollingFetch<FleetData>(
    "/api/fleet/agents"
  );

  if (loading && !data) {
    return (
      <div className="space-y-5">
        <ShellHeader
          title="Fleet"
          subtitle="Real-time status of Warden's four-agent orchestration layer."
        />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SkeletonCard lines={5} height="h-48" />
          <SkeletonCard lines={5} height="h-48" />
          <SkeletonCard lines={5} height="h-48" />
          <SkeletonCard lines={5} height="h-48" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-5">
        <ShellHeader
          title="Fleet"
          subtitle="Real-time status of Warden's four-agent orchestration layer."
        />
        <ErrorState error={error} />
      </div>
    );
  }

  const agents = data?.agents ?? [];
  const attributionNote = data
    ? `Attribution accuracy: delegate-authored messages from ${formatAttributionCutoff(data.attribution_cutoff)} onward. Older rows may show as Warden-authored.`
    : "";

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Fleet"
        subtitle="Real-time status of Warden's four-agent orchestration layer."
        action={
          <span
            className={`flex items-center gap-2 rounded-full border border-border bg-bg-card px-3 py-1 text-xs ${
              connected ? "text-green" : "text-text-dim"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                connected ? "bg-green animate-pulse" : "bg-text-dim"
              }`}
            />
            {connected ? "Live" : "Polling 15s"}
          </span>
        }
      />
      <SectionDescription id="fleet">
        Warden orchestrates four agents across three harnesses. Each card shows
        identity, recent activity from the WAEL stream, inbound delegations
        over 7 days, latest assistant messages, and active work entries.
      </SectionDescription>

      {agents.length === 0 ? (
        <EmptyState
          icon={Bot}
          title="Fleet not populated"
          description="No active fleet agents returned from /api/fleet/agents. Check that agent_identities has the 4 fleet slugs with active=TRUE."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {agents.map((agent) => (
            <AgentCard key={agent.identity.slug} agent={agent} />
          ))}
        </div>
      )}

      <p className="pt-2 text-[11px] leading-5 text-text-dim">{attributionNote}</p>
      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function AgentCard({ agent }: { agent: FleetAgent }) {
  const { identity, activity, delegations, messages, work_entries } = agent;
  const statusKey = statusKeyFor(activity.last_activity);
  const status = activityStatus(activity.last_activity);
  const isWarden = identity.slug === "warden";

  return (
    <Card className={status.panel}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <StatusRing status={statusKey} size={36} />
          <div>
            <div className="flex items-center gap-2">
              {identity.emoji ? (
                <span className="text-lg leading-none">{identity.emoji}</span>
              ) : null}
              <h2 className="text-lg font-semibold text-text">
                {identity.display_name}
              </h2>
              {identity.harness ? (
                <span className="rounded-full bg-cyan/10 px-2 py-0.5 text-[10px] font-semibold text-cyan">
                  {identity.harness}
                </span>
              ) : null}
              {isWarden ? (
                <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
                  governor
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-text-dim">
              {identity.model ?? "—"} · {identity.home_server ?? "—"}
            </p>
          </div>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.tone} bg-white/5`}
        >
          {status.label}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <MiniMetric label="last activity" value={timeAgo(activity.last_activity)} />
        <MiniMetric label="events 24h" value={String(activity.events_24h)} />
        <MiniMetric label="started" value={String(activity.started_24h)} />
        <MiniMetric label="completed" value={String(activity.completed_24h)} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div>
          <SectionTitle title="Recent events" />
          {activity.recent_events.length === 0 ? (
            <p className="text-xs text-text-dim">No WAEL events in the last 24h.</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {activity.recent_events.map((ev, i) => (
                <li
                  key={`${agent.identity.slug}-ev-${i}`}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="truncate">
                    <span className="font-mono text-text-dim">
                      {ev.event_type}
                    </span>
                    {ev.status ? (
                      <span
                        className={`ml-2 text-[10px] ${
                          ev.status === "error"
                            ? "text-red"
                            : ev.status === "timeout"
                            ? "text-amber"
                            : "text-text-dim"
                        }`}
                      >
                        {ev.status}
                      </span>
                    ) : null}
                    {ev.duration_ms != null ? (
                      <span className="ml-2 text-[10px] text-text-dim">
                        {ev.duration_ms}ms
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-text-dim">{timeAgo(ev.ts)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle title="Delegations (7d)" />
          {isWarden ? (
            <p className="text-xs text-text-dim">
              Delegator. Self-delegation refusals excluded per Phase 6.
            </p>
          ) : (
            <DelegationBreakdown items={delegations.seven_day} />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 xl:grid-cols-2">
        <div>
          <SectionTitle title="Recent messages" />
          {messages.length === 0 ? (
            <p className="text-xs text-text-dim">
              No assistant messages in the last 7 days.
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {messages.map((m) => (
                <li
                  key={m.id}
                  className="rounded-lg border border-border bg-bg-deep/40 p-2"
                >
                  <p className="line-clamp-2 text-text">{m.preview}</p>
                  <p className="mt-1 text-[10px] text-text-dim">
                    {timeAgo(m.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionTitle title="Active work" />
          {work_entries.length === 0 ? (
            <p className="text-xs text-text-dim">No open work entries.</p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {work_entries.map((w) => (
                <li
                  key={w.id}
                  className="flex items-start justify-between gap-2 rounded-lg border border-border bg-bg-deep/40 p-2"
                >
                  <span className="min-w-0 flex-1 truncate text-text">
                    {w.title}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                        w.status === "in_progress"
                          ? "bg-cyan/15 text-cyan"
                          : w.status === "blocked"
                          ? "bg-red/15 text-red"
                          : "bg-white/5 text-text-dim"
                      }`}
                    >
                      {w.status}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                        w.priority <= 1
                          ? "bg-red/15 text-red"
                          : w.priority <= 3
                          ? "bg-amber/15 text-amber"
                          : "bg-white/5 text-text-dim"
                      }`}
                    >
                      P{w.priority}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Card>
  );
}

function DelegationBreakdown({
  items,
}: {
  items: Array<{ status: string; count: number }>;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-text-dim">No inbound delegations in 7d.</p>;
  }
  const total = items.reduce((sum, i) => sum + i.count, 0);
  const done = items.find((i) => i.status === "done")?.count ?? 0;
  const successRate = total > 0 ? Math.round((done / total) * 100) : 0;
  const successTone =
    successRate >= 90 ? "text-green" : successRate >= 70 ? "text-amber" : "text-red";

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2 text-xs">
        <span className={`font-mono text-sm font-bold ${successTone}`}>
          {successRate}%
        </span>
        <span className="text-text-dim">success ({total} total)</span>
      </div>
      <ul className="flex flex-wrap gap-1 text-[10px]">
        {items.map((i) => (
          <li
            key={i.status}
            className={`rounded-full px-2 py-0.5 font-semibold ${
              i.status === "done"
                ? "bg-green/15 text-green"
                : i.status === "error"
                ? "bg-red/15 text-red"
                : i.status === "reaped"
                ? "bg-amber/15 text-amber"
                : "bg-white/5 text-text-dim"
            }`}
          >
            {i.status} · {i.count}
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-bg-deep/40 p-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-text-dim">
        {label}
      </p>
      <p className="mt-0.5 font-mono text-sm text-text">{value}</p>
    </div>
  );
}
