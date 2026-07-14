"use client";

import type { ReactNode } from "react";
import { CHART } from "@/lib/chart-colors";

// Persona palette (transformate WI-392 / PR-7 visual review locked):
//   warden=emerald, codesmith=slate (deeper than fallback), lumina=amber, sentinel=teal.
// Brynn rules: NO cyan, NO purple, NO pink, NO red (red reserved for kill/warning).
const PERSONA_COLORS: Record<string, { bg: string; fg: string }> = {
  warden: { bg: "rgba(var(--success-rgb), 0.16)", fg: CHART.accent },
  codesmith: { bg: "rgba(var(--chart-slate-rgb), 0.18)", fg: CHART.slate },
  lumina: { bg: "rgba(var(--warning-rgb), 0.16)", fg: CHART.amber },
  sentinel: { bg: "rgba(var(--chart-teal-rgb), 0.16)", fg: CHART.teal },
};

const FALLBACK_COLOR = { bg: "rgba(var(--chart-slate-rgb), 0.16)", fg: CHART.slate };

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export function Avatar({
  name,
  persona,
  size = "md",
}: {
  name: string;
  persona?: string;
  size?: "sm" | "md";
}) {
  const palette = (persona && PERSONA_COLORS[persona.toLowerCase()]) || FALLBACK_COLOR;
  const dim = size === "sm" ? 24 : 32;
  const fontSize = size === "sm" ? 10 : 12;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full font-mono font-medium"
      style={{
        width: dim,
        height: dim,
        backgroundColor: palette.bg,
        color: palette.fg,
        fontSize,
        letterSpacing: "0.02em",
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      className="inline-flex min-w-[18px] items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-surface-2)] px-1 text-[10px] font-medium text-[var(--text-secondary)]"
      style={{ height: 18, lineHeight: 1 }}
    >
      {children}
    </kbd>
  );
}

/**
 * Convert event timestamps into hourly buckets covering the last 24h.
 * Returns `Array<{ value: number }>` shaped for the recharts-based
 * Sparkline in `./charts.tsx` (no behavior shared with the canonical
 * `screens/agents.jsx` Sparkline — that one took a raw number array).
 *
 * Returns [] when no in-window timestamps exist so the caller can render
 * a dash placeholder per Rule 12 (fail loud — no synthetic sparklines).
 */
export function bucketHourly(
  timestamps: Array<string | null | undefined>,
  bucketsCount = 12,
): Array<{ value: number }> {
  if (!timestamps || timestamps.length === 0) return [];
  const nowMs = Date.now();
  const windowMs = 24 * 60 * 60 * 1000;
  const bucketMs = windowMs / bucketsCount;
  const buckets = new Array<number>(bucketsCount).fill(0);
  let any = false;
  for (const ts of timestamps) {
    if (!ts) continue;
    const t = Date.parse(ts);
    if (Number.isNaN(t)) continue;
    const ageMs = nowMs - t;
    if (ageMs < 0 || ageMs > windowMs) continue;
    const idx = bucketsCount - 1 - Math.floor(ageMs / bucketMs);
    if (idx >= 0 && idx < bucketsCount) {
      buckets[idx] = (buckets[idx] ?? 0) + 1;
      any = true;
    }
  }
  if (!any) return [];
  return buckets.map((value) => ({ value }));
}
