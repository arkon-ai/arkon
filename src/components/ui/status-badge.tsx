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
  running:   { bg: "bg-[rgba(0,212,126,0.15)]", text: "text-[#00D47E]",  dot: "bg-[#00D47E]",  pulse: true },
  healthy:   { bg: "bg-[rgba(16,185,129,0.15)]", text: "text-[#10B981]",  dot: "bg-[#10B981]" },
  paused:    { bg: "bg-[rgba(136,136,160,0.15)]", text: "text-[#8888A0]", dot: "bg-[#8888A0]" },
  scheduled: { bg: "bg-[rgba(6,182,212,0.15)]",  text: "text-[#06B6D4]",  dot: "bg-[#06B6D4]" },
  degraded:  { bg: "bg-[rgba(245,158,11,0.15)]", text: "text-[#F59E0B]",  dot: "bg-[#F59E0B]",  pulse: true },
  failed:    { bg: "bg-[rgba(239,68,68,0.15)]",  text: "text-[#EF4444]",  dot: "bg-[#EF4444]" },
  offline:   { bg: "bg-[rgba(85,85,102,0.15)]",  text: "text-[#555566]",  dot: "bg-[#555566]" },
  idle:      { bg: "bg-[rgba(136,136,160,0.15)]", text: "text-[#8888A0]", dot: "bg-[#8888A0]" },
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
