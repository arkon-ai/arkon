"use client";

import type { ReactNode } from "react";

/**
 * Mission Control — kit extras
 * ─────────────────────────────────────────────────────────────────────────
 * Screen-class composites that span multiple screens but aren't generic
 * enough for `ui-cards.tsx`. Add here when the same shape will surface on
 * 2+ screens (dashboard, traces, journal, incidents, etc.). Promote to
 * `ui-cards.tsx` when it becomes a truly generic primitive.
 *
 * Why this file exists: per the refresh rectification (handoff §F2),
 * screens were inventing inline wrappers (`DashboardLiveFeed`,
 * `DashboardCard`, …) that fragmented the kit. New screen-class composites
 * land here so they're reusable from the first call site.
 * ─────────────────────────────────────────────────────────────────────────
 */

type LiveFeedTone = "live" | "warm" | "idle" | "err" | "info" | "ok" | "neutral";

/**
 * Generic item shape. Adapter pattern: each consuming screen maps its
 * domain object (RecentEvent, AgentTrace, IncidentEntry…) to this shape
 * at the call site. Keep the renderer schema-stable; pivot at the boundary.
 */
export type LiveFeedItem = {
  /** Stable identifier for React reconciliation. */
  id: string;
  /** Actor / source label (agent name, tenant, etc.). */
  who: ReactNode;
  /** Event summary. Short — single line preferred. */
  msg: ReactNode;
  /** Timestamp or relative-time label (already formatted by caller). */
  when: ReactNode;
  /** Dot tone. Maps to the same tone vocabulary as `StatusPill`. */
  kind?: LiveFeedTone;
};

function dotToneClass(kind: LiveFeedTone | undefined) {
  switch (kind) {
    case "live":
    case "ok":
      return "bg-[var(--accent)]";
    case "warm":
      return "bg-[var(--warning)]";
    case "err":
      return "bg-[var(--danger)]";
    case "info":
      return "bg-[var(--info)]";
    case "neutral":
      return "bg-[var(--text-tertiary)]";
    case "idle":
    default:
      return "bg-[var(--border-strong)]";
  }
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

/**
 * LiveFeed — pulse-style chronological event stream.
 *
 * Canonical use: dashboard recent-activity, traces tail, journal entries,
 * incidents drawer. Wrap in `<Card flush>` when the parent surface is a
 * card; the feed itself draws no border so it composes inside any container.
 *
 * Empty state is the caller's responsibility — show an `EmptyState` from
 * `ui-cards.tsx` instead of an empty `LiveFeed`.
 */
export function LiveFeed({
  items,
  className = "",
}: {
  items: LiveFeedItem[];
  className?: string;
}) {
  return (
    <ul className={cn("divide-y divide-[var(--border)]", className)}>
      {items.map((item) => (
        <li
          key={item.id}
          className="flex items-center gap-3 px-5 py-3 text-sm"
        >
          <span
            className={cn(
              "h-2 w-2 shrink-0 rounded-full",
              dotToneClass(item.kind),
              item.kind === "live" && "animate-pulse",
            )}
            aria-hidden="true"
          />
          <span className="font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {item.who}
          </span>
          <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
            {item.msg}
          </span>
          <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {item.when}
          </span>
        </li>
      ))}
    </ul>
  );
}
