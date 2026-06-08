"use client";

type BadgeStatus =
  | "running"
  | "healthy"
  | "paused"
  | "scheduled"
  | "degraded"
  | "failed"
  | "offline"
  | "idle";

interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string;
  className?: string;
}

const statusConfig: Record<BadgeStatus, { bg: string; text: string; dot: string; pulse?: boolean }> = {
  running:   { bg: "bg-[rgba(var(--quarn-rgb),0.15)]", text: "text-[var(--accent)]",  dot: "bg-[var(--accent)]",  pulse: true },
  healthy:   { bg: "bg-[rgba(var(--success-rgb),0.15)]", text: "text-[var(--success)]",  dot: "bg-[var(--success)]" },
  paused:    { bg: "bg-[rgba(136,136,160,0.15)]", text: "text-[var(--text-secondary)]", dot: "bg-[var(--fg-2)]" },
  scheduled: { bg: "bg-[rgba(var(--info-rgb),0.15)]",  text: "text-[var(--info)]",  dot: "bg-[var(--info)]" },
  degraded:  { bg: "bg-[rgba(var(--warning-rgb),0.15)]", text: "text-[var(--warning)]",  dot: "bg-[var(--warning)]",  pulse: true },
  failed:    { bg: "bg-[rgba(var(--danger-rgb),0.15)]",  text: "text-[var(--danger)]",  dot: "bg-[var(--danger)]" },
  offline:   { bg: "bg-[rgba(85,85,102,0.15)]",  text: "text-[var(--text-tertiary)]",  dot: "bg-[var(--fg-3)]" },
  idle:      { bg: "bg-[rgba(136,136,160,0.15)]", text: "text-[var(--text-secondary)]", dot: "bg-[var(--fg-2)]" },
};

export function StatusBadge({ status, label, className = "" }: StatusBadgeProps) {
  const config = statusConfig[status];
  const displayLabel = label || status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${config.bg} ${config.text} ${className}`}
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${config.dot} ${config.pulse ? "ring-pulse-fast" : ""}`} />
      {displayLabel}
    </span>
  );
}