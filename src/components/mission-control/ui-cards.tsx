"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

/* ═══════════════════════════════════════
   Unified Card Components
   Design tokens: --bg-card, --border, --radius-card
   Phase 2: GlowingEffect emerald glow on hover
═══════════════════════════════════════ */

export function StatCard({
  label,
  value,
  subtitle,
  icon: Icon,
  trend,
  sparkline,
  className = "",
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: { value: string; direction: "up" | "down" | "neutral" };
  sparkline?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:border-[var(--accent)]/30 hover:shadow-[0_0_20px_rgba(0,212,126,0.15),0_0_60px_rgba(0,212,126,0.08)] ${className}`}
    >
      <GlowingEffect
        spread={40}
        glow
        disabled={false}
        proximity={64}
        inactiveZone={0.01}
        borderWidth={2}
      />
      <div className="relative z-10 flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]" style={{ fontFamily: "var(--font-mono)" }}>
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs text-[var(--text-secondary)]">{subtitle}</p>
          ) : null}
          {trend ? (
            <p
              className={`mt-1 text-[11px] font-semibold ${
                trend.direction === "up"
                  ? "text-[var(--accent)]"
                  : trend.direction === "down"
                  ? "text-[var(--danger)]"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : "\u2192"}{" "}
              {trend.value} <span className="text-[var(--text-tertiary)] font-normal">vs yesterday</span>
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(0,212,126,0.06)] text-[var(--accent)]">
              <Icon className="h-4.5 w-4.5" />
            </div>
          ) : null}
          {sparkline ? <div className="mt-1">{sparkline}</div> : null}
        </div>
      </div>
    </div>
  );
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
    <div
      className={`relative rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:border-[var(--accent)]/30 hover:shadow-[0_0_20px_rgba(0,212,126,0.15),0_0_60px_rgba(0,212,126,0.08)] ${className}`}
    >
      <GlowingEffect
        spread={40}
        glow
        disabled={false}
        proximity={64}
        inactiveZone={0.01}
        borderWidth={2}
      />
      <div className="relative z-10">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 text-[var(--text-secondary)]" /> : null}
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
              {title}
            </h3>
          </div>
          {action}
        </div>
        {children}
      </div>
    </div>
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
    <div
      className={`relative rounded-[16px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[0_4px_24px_rgba(0,0,0,0.2)] transition-all duration-300 hover:border-[var(--accent)]/30 hover:shadow-[0_0_20px_rgba(0,212,126,0.15),0_0_60px_rgba(0,212,126,0.08)] ${className}`}
    >
      <GlowingEffect
        spread={40}
        glow
        disabled={false}
        proximity={64}
        inactiveZone={0.01}
        borderWidth={2}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between border-b border-[var(--border)]/50 px-4 py-3">
          <div className="flex items-center gap-2">
            {Icon ? <Icon className="h-4 w-4 text-[var(--text-secondary)]" /> : null}
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
          </div>
          {action}
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyCard({
  title,
  description,
  icon: Icon,
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
    <div
      className={`flex flex-col items-center justify-center rounded-[16px] border border-[var(--border)] border-dashed bg-[var(--bg-surface)]/50 px-6 py-12 text-center ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)]">
        <Icon className="h-6 w-6 text-[var(--text-tertiary)]" />
      </div>
      <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--text-secondary)]">{description}</p>
      {action && actionHref ? (
        <a
          href={actionHref}
          className="mt-6 rounded-[12px] bg-[rgba(0,212,126,0.08)] px-5 py-2.5 text-sm font-semibold text-[var(--accent)] transition hover:bg-[rgba(0,212,126,0.14)]"
        >
          {action}
        </a>
      ) : null}
    </div>
  );
}
