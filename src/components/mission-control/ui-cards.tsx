"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from "lucide-react";

type Tone = "live" | "warm" | "idle" | "err" | "info" | "ok" | "neutral";
type ButtonKind = "secondary" | "primary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function toneClasses(tone: Tone) {
  switch (tone) {
    case "live":
      return "border-[rgba(0,212,126,0.35)] text-[var(--accent)]";
    case "warm":
      return "border-[rgba(245,158,11,0.35)] text-[var(--warning)]";
    case "err":
      return "border-[rgba(239,68,68,0.35)] text-[var(--danger)]";
    case "info":
      return "border-[rgba(6,182,212,0.35)] text-[var(--info)]";
    case "ok":
      return "border-[rgba(16,185,129,0.35)] text-[var(--success)]";
    case "neutral":
      return "border-[var(--border)] bg-[var(--bg-surface-2)] text-[var(--text-secondary)]";
    case "idle":
    default:
      return "border-[var(--border)] text-[var(--text-secondary)]";
  }
}

export function StatusPill({
  status = "idle",
  children,
  solid = false,
  className = "",
}: {
  status?: Tone;
  children: ReactNode;
  solid?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em]",
        toneClasses(status),
        solid && "border-transparent bg-[rgba(0,212,126,0.12)] text-[var(--accent)]",
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "live" && "animate-pulse")} />
      {children}
    </span>
  );
}

export function Button({
  kind = "secondary",
  size = "md",
  icon: Icon,
  iconRight: IconRight,
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  kind?: ButtonKind;
  size?: ButtonSize;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-button)] border font-medium transition disabled:cursor-not-allowed disabled:opacity-40",
        size === "sm" ? "h-6 px-2 text-xs" : size === "lg" ? "h-9 px-4 text-sm" : "h-[30px] px-3 text-[13px]",
        kind === "primary" && "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] hover:bg-[var(--accent-hover)]",
        kind === "secondary" && "border-[var(--border)] bg-transparent text-[var(--text-primary)] hover:border-[var(--border-hover)] hover:bg-[var(--bg-surface)]",
        kind === "ghost" && "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]",
        kind === "danger" && "border-[rgba(239,68,68,0.4)] bg-transparent text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]",
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
      {children}
      {IconRight ? <IconRight className="h-3.5 w-3.5" /> : null}
    </button>
  );
}

export function Tabs<T extends string>({
  items,
  active,
  onChange,
  className = "",
}: {
  items: Array<{ id: T; label: string }>;
  active: T;
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex gap-px rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-surface)] p-0.5", className)}>
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={cn(
            "rounded-[var(--radius-sm)] px-3 py-1.5 text-xs font-medium transition",
            active === item.id
              ? "bg-[var(--bg-surface-2)] text-[var(--text-primary)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  action,
  live,
  updated,
  className = "",
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  action?: ReactNode;
  live?: boolean;
  updated?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {eyebrow ? (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="inline-flex items-baseline gap-2 text-[28px] font-semibold leading-tight tracking-normal text-[var(--text-primary)] sm:text-4xl">
            {title}
            <span className="inline-grid h-3.5 w-3.5 translate-y-[-5px] place-items-center text-[var(--text-tertiary)]" title="Help">
              <Info className="h-3.5 w-3.5" />
            </span>
          </h1>
          {subtitle ? (
            <p className="mt-2 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">{subtitle}</p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {live ? <StatusPill status="live">Live</StatusPill> : null}
          {updated ? <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">Updated {updated}</span> : null}
          {action}
        </div>
      </div>
    </header>
  );
}

export function Card({
  title,
  meta,
  action,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = title || meta || action;
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)]", className)}>
      {hasHeader ? (
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          {title ? <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3> : null}
          {meta ? <div className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{meta}</div> : null}
          {action ? <div className={cn(!meta && "ml-auto")}>{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(hasHeader ? "p-5" : "p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function SectionTitle({
  title,
  note,
  action,
  className = "",
}: {
  title: string;
  note?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-3 flex items-baseline gap-3", className)}>
      <h2 className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{title}</h2>
      {note ? <span className="text-xs text-[var(--text-tertiary)]">{note}</span> : null}
      {action ? <div className="ml-auto">{action}</div> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  subtitle,
  sub,
  icon: Icon,
  trend,
  delta,
  deltaDir,
  variant = "default",
  sparkline,
  className = "",
}: {
  label: string;
  value: ReactNode;
  subtitle?: string;
  sub?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  delta?: string;
  deltaDir?: "up" | "down" | "neutral";
  variant?: "default" | "warn" | "bad";
  sparkline?: ReactNode;
  className?: string;
}) {
  const effectiveDelta = delta ?? trend?.value;
  const direction = deltaDir ?? trend?.direction ?? "neutral";
  const DeltaIcon = direction === "up" ? ArrowUpRight : direction === "down" ? ArrowDownRight : ArrowRight;
  return (
    <div className={cn("min-w-0 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] px-5 py-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="truncate font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{label}</p>
        {effectiveDelta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 font-mono text-[11px]",
              direction === "up" && "text-[var(--accent)]",
              direction === "down" && "text-[var(--warning)]",
              direction === "neutral" && "text-[var(--text-secondary)]",
            )}
          >
            <DeltaIcon className="h-3 w-3" />
            {effectiveDelta}
          </span>
        ) : Icon ? (
          <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
        ) : null}
      </div>
      <p
        className={cn(
          "mt-2 font-mono text-[28px] font-medium leading-none tracking-normal text-[var(--text-primary)]",
          variant === "warn" && "text-[var(--warning)]",
          variant === "bad" && "text-[var(--danger)]",
        )}
      >
        {value}
      </p>
      {sparkline ? <div className="mt-2 h-7 overflow-hidden">{sparkline}</div> : null}
      {subtitle || sub ? <p className="mt-2 font-mono text-[11px] text-[var(--text-tertiary)]">{subtitle ?? sub}</p> : null}
    </div>
  );
}

export function PulseStrip({
  cells,
  className = "",
}: {
  cells: Array<{
    label: string;
    value: ReactNode;
    unit?: string;
    sub?: ReactNode;
    tint?: "warn" | "bad" | "ok";
    icon?: ComponentType<{ className?: string }>;
  }>;
  className?: string;
}) {
  return (
    <div className={cn("grid overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)] md:grid-cols-4", className)}>
      {cells.map((cell) => {
        const Icon = cell.icon;
        return (
          <div key={cell.label} className="min-w-0 border-b border-[var(--border)] p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0">
            <div className="flex items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
              {Icon ? <Icon className="h-3 w-3" /> : null}
              {cell.label}
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={cn(
                  "font-mono text-[28px] font-medium leading-none tracking-normal text-[var(--text-primary)]",
                  cell.tint === "warn" && "text-[var(--warning)]",
                  cell.tint === "bad" && "text-[var(--danger)]",
                )}
              >
                {cell.value}
              </span>
              {cell.unit ? <span className="font-mono text-[11px] text-[var(--text-tertiary)]">{cell.unit}</span> : null}
            </div>
            {cell.sub ? <div className="mt-2 font-mono text-[11px] text-[var(--text-secondary)]">{cell.sub}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

export function EmptyStateBrief({
  title,
  description,
  icon: Icon,
  action,
  stats,
  className = "",
}: {
  title: string;
  description?: string;
  icon: LucideIcon;
  action?: ReactNode;
  stats?: Array<{ label: string; value: string | number }>;
  className?: string;
}) {
  return (
    <div className={cn("rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-6", className)}>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--accent)]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
          {description ? <p className="mt-1 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">{description}</p> : null}
        </div>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {stats && stats.length > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-3 border-y border-[var(--border)] py-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{stat.label}</p>
              <p className="mt-1 font-mono text-lg text-[var(--text-primary)]">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function StatCard(props: {
  label: string;
  value: ReactNode;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  sparkline?: ReactNode;
  className?: string;
}) {
  return <MetricCard {...props} />;
}

export function ListCard({
  title,
  icon: Icon,
  children,
  action,
  className = "",
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={className}
      title={title}
      action={action}
      bodyClassName="p-4"
      meta={Icon ? <Icon className="h-4 w-4 text-[var(--text-tertiary)]" /> : undefined}
    >
      {children}
    </Card>
  );
}

export function DetailCard({
  title,
  icon: Icon,
  children,
  action,
  className = "",
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <Card
      title={title}
      action={action}
      className={className}
      meta={Icon ? <Icon className="h-4 w-4 text-[var(--text-tertiary)]" /> : undefined}
    >
      {children}
    </Card>
  );
}

export function EmptyCard({
  title,
  description,
  icon,
  action,
  actionHref,
  className = "",
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: string;
  actionHref?: string;
  className?: string;
}) {
  return (
    <EmptyStateBrief
      title={title}
      description={description}
      icon={icon}
      className={className}
      action={
        action && actionHref ? (
          <Link
            href={actionHref}
            className="rounded-[var(--radius-button)] border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--accent)] transition hover:border-[var(--border-hover)]"
          >
            {action}
          </Link>
        ) : undefined
      }
    />
  );
}
