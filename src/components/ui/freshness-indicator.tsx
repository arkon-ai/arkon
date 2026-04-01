"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

interface FreshnessIndicatorProps {
  lastUpdated: Date | string | number | null;
  staleThresholdMs?: number;
  onRefresh?: () => void;
  className?: string;
}

function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 5) return "Just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export function FreshnessIndicator({
  lastUpdated,
  staleThresholdMs = 5 * 60 * 1000, // 5 min default
  onRefresh,
  className = "",
}: FreshnessIndicatorProps) {
  const [age, setAge] = useState(0);

  useEffect(() => {
    if (!lastUpdated) return;
    const ts = typeof lastUpdated === "object" && lastUpdated instanceof Date
      ? lastUpdated.getTime()
      : new Date(lastUpdated).getTime();

    function tick() {
      setAge(Date.now() - ts);
    }
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  if (!lastUpdated) return null;

  const isStale = age > staleThresholdMs;

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] ${
        isStale ? "text-[var(--warning)]" : "text-[var(--text-tertiary)]"
      } ${className}`}
    >
      {isStale ? (
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--warning)] animate-pulse" />
      ) : null}
      <span>Updated {formatAge(age)}</span>
      {onRefresh ? (
        <button
          type="button"
          onClick={onRefresh}
          className="rounded p-0.5 transition hover:bg-white/[0.04] hover:text-[var(--text-secondary)]"
          title="Refresh"
        >
          <RefreshCw className="h-3 w-3" />
        </button>
      ) : null}
    </span>
  );
}
