"use client";

import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowRight, ArrowUpRight, ChevronRight } from "lucide-react";

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
  crumbs,
  action,
  live,
  updated,
  className = "",
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  /**
   * Breadcrumb chain (canonical: `['Arkon', '<Pillar>', '<Screen>']`).
   * When provided, renders above the title row with chevron separators and
   * supersedes `eyebrow`. Last item is styled as "here". Reinforces the
   * 4-pillar IA from PR-05.
   */
  crumbs?: string[];
  action?: ReactNode;
  live?: boolean;
  updated?: string;
  className?: string;
}) {
  const hasCrumbs = crumbs && crumbs.length > 0;
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      {hasCrumbs ? (
        <nav
          aria-label="Breadcrumb"
          className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]"
        >
          {crumbs!.map((crumb, i) => {
            const isLast = i === crumbs!.length - 1;
            return (
              <span key={`${i}-${crumb}`} className="inline-flex items-center gap-1.5">
                {i > 0 ? <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" aria-hidden="true" /> : null}
                <span
                  className={cn(isLast && "text-[var(--text-secondary)]")}
                  aria-current={isLast ? "page" : undefined}
                >
                  {crumb}
                </span>
              </span>
            );
          })}
        </nav>
      ) : eyebrow ? (
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
          {eyebrow}
        </p>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="inline-flex items-baseline gap-2 text-[28px] font-semibold leading-tight tracking-normal text-[var(--text-primary)] sm:text-4xl">
            {title}
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
  flush,
  children,
  className = "",
  bodyClassName = "",
}: {
  title?: string;
  meta?: ReactNode;
  action?: ReactNode;
  /**
   * When true, body padding is removed. Equivalent to `bodyClassName="p-0"`
   * but cleaner at call sites for the common pulse-strip / table / feed case.
   * `bodyClassName` padding utilities still win if both are supplied (caller's
   * explicit override takes precedence).
   */
  flush?: boolean;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  const hasHeader = title || meta || action;
  const hasBodyPaddingOverride = /\b(?:p|px|py|pt|pr|pb|pl)-/.test(bodyClassName);
  const defaultBodyPadding = hasBodyPaddingOverride
    ? ""
    : flush
    ? "p-0"
    : hasHeader
    ? "p-5"
    : "p-4";
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)]", className)}>
      {hasHeader ? (
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
          {title ? <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3> : null}
          {meta ? <div className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{meta}</div> : null}
          {action ? <div className={cn(!meta && "ml-auto")}>{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(defaultBodyPadding, bodyClassName)}>{children}</div>
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
  cols,
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
  /**
   * Strict column count at md+ breakpoints (2|3|4|5|6). When set, overrides the
   * default `md:grid-cols-4`. Forecast at integrations.tsx:81 — PR-9a ships it.
   * Below md the strip stacks to a single column regardless.
   *
   * NOTE: literal class names only — Tailwind v4 JIT purges template-literal
   * and arbitrary-CSS-var classes. See memory: tailwind-v4-literal-class-names.
   */
  cols?: 2 | 3 | 4 | 5 | 6;
  className?: string;
}) {
  const colsClass =
    cols === 2 ? "md:grid-cols-2"
    : cols === 3 ? "md:grid-cols-3"
    : cols === 5 ? "md:grid-cols-5"
    : cols === 6 ? "md:grid-cols-6"
    : "md:grid-cols-4";
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--bg-surface)]",
        colsClass,
        className,
      )}
    >
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

/**
 * EmptyState — canonical empty-state primitive per design brief.
 * Operator briefing format: icon + title + meta header, optional stats grid,
 * optional body paragraph, optional action. Supersedes `EmptyCard` and
 * `EmptyStateBrief` (both `@deprecated` — hard-delete planned for a Phase N
 * cleanup PR once consumers migrate).
 *
 * Stats shape (`{label, value}`) matches repo convention; canonical brief uses
 * `{k, v}` — converted at this boundary so call sites stay readable.
 */
export function EmptyState({
  icon: Icon,
  title,
  meta,
  stats,
  body,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  meta?: ReactNode;
  stats?: Array<{ label: string; value: ReactNode }>;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-6",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-[var(--radius-md)] border border-[var(--border)] text-[var(--accent)]">
          <Icon className="h-[18px] w-[18px]" />
        </span>
        <h3 className="min-w-0 text-sm font-medium text-[var(--text-primary)]">{title}</h3>
        {meta ? (
          <div className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
            {meta}
          </div>
        ) : null}
      </div>
      {stats && stats.length > 0 ? (
        // TODO(F3+): `grid-cols-3` is inherited from EmptyStateBrief. Resolve to
        // auto-fit or per-count layout once real call sites surface with !=3 stats.
        // Surfaced by @claude on F2 review — non-blocking, kept for now to avoid
        // mid-PR refactor without callsite evidence.
        <div className="mt-4 grid grid-cols-3 gap-3 border-y border-[var(--border)] py-3">
          {stats.map((stat, i) => (
            <div key={`${i}-${stat.label}`}>
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">{stat.label}</p>
              <p className="mt-1 font-mono text-lg text-[var(--text-primary)]">{stat.value}</p>
            </div>
          ))}
        </div>
      ) : null}
      {body ? <div className="mt-4 max-w-[60ch] text-sm leading-6 text-[var(--text-secondary)]">{body}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * @deprecated Use `EmptyState` instead. Hard-delete planned in a Phase N
 * cleanup PR — kept for callers during the migration window.
 */
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

/**
 * @deprecated Pass the same props directly to `MetricCard`. This is a
 * one-line proxy that exists for historical reasons; hard-delete planned
 * in a Phase N cleanup PR.
 */
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

/**
 * @deprecated Use `<Card title icon-as-meta action>` directly. This wrapper
 * adds nothing beyond passing the icon through `meta` and fixing body padding
 * to `p-4` — both available on `Card`. Hard-delete planned in a Phase N
 * cleanup PR.
 */
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

/**
 * @deprecated Use `<Card title meta action>` directly with the icon as the
 * `meta` value. This wrapper adds nothing beyond that. Hard-delete planned
 * in a Phase N cleanup PR.
 */
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

/**
 * @deprecated Use `EmptyState` instead. This wrapper around `EmptyStateBrief`
 * also accepts `actionHref` for a styled link — port to `EmptyState` with a
 * `<Link>` inside the `action` slot. Hard-delete planned in a Phase N
 * cleanup PR.
 */
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
