"use client";

import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/* ═══════════════════════════════════════
   Unified Card Components
   Design tokens: --bg-card, --border, --radius-card
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
      className={`card-hover rounded-[16px] border border-[#2E2E3A] bg-[#1A1A22] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#555566]">
            {label}
          </p>
          <p className="mt-1.5 text-2xl font-bold tracking-tight text-[#E4E4ED]">
            {value}
          </p>
          {subtitle ? (
            <p className="mt-1 text-xs text-[#8888A0]">{subtitle}</p>
          ) : null}
          {trend ? (
            <p
              className={`mt-1 text-[11px] font-semibold ${
                trend.direction === "up"
                  ? "text-[#00D47E]"
                  : trend.direction === "down"
                  ? "text-[#ef4444]"
                  : "text-[#8888A0]"
              }`}
            >
              {trend.direction === "up" ? "\u2191" : trend.direction === "down" ? "\u2193" : ""}{" "}
              {trend.value}
            </p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-2">
          {Icon ? (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(0,212,126,0.06)] text-[#00D47E]">
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
      className={`card-hover rounded-[16px] border border-[#2E2E3A] bg-[#1A1A22] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] ${className}`}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-[#8888A0]" /> : null}
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#555566]">
            {title}
          </h3>
        </div>
        {action}
      </div>
      {children}
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
      className={`card-hover rounded-[16px] border border-[#2E2E3A] bg-[#1A1A22] shadow-[0_4px_24px_rgba(0,0,0,0.2)] ${className}`}
    >
      <div className="flex items-center justify-between border-b border-[#2E2E3A]/50 px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 text-[#8888A0]" /> : null}
          <h3 className="text-sm font-semibold text-[#E4E4ED]">{title}</h3>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
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
      className={`flex flex-col items-center justify-center rounded-[16px] border border-[#2E2E3A] border-dashed bg-[#1A1A22]/50 px-6 py-12 text-center ${className}`}
    >
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#2E2E3A] bg-[#0A0A0C]">
        <Icon className="h-6 w-6 text-[#555566]" />
      </div>
      <h3 className="text-base font-semibold text-[#E4E4ED]">{title}</h3>
      <p className="mt-2 max-w-sm text-sm leading-6 text-[#8888A0]">{description}</p>
      {action && actionHref ? (
        <a
          href={actionHref}
          className="mt-6 rounded-[12px] bg-[rgba(0,212,126,0.08)] px-5 py-2.5 text-sm font-semibold text-[#00D47E] transition hover:bg-[rgba(0,212,126,0.14)]"
        >
          {action}
        </a>
      ) : null}
    </div>
  );
}
