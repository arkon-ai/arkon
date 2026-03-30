"use client";

import { type HTMLAttributes } from "react";

type SkeletonVariant = "text" | "card" | "chart" | "table-row" | "avatar" | "stat";

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  lines?: number;
}

const variantStyles: Record<SkeletonVariant, string> = {
  text: "h-4 w-full rounded",
  card: "h-32 w-full rounded-xl",
  chart: "h-48 w-full rounded-xl",
  "table-row": "h-12 w-full rounded-lg",
  avatar: "h-8 w-8 rounded-full",
  stat: "h-20 w-full rounded-xl",
};

export function Skeleton({ variant = "text", lines = 1, className = "", ...props }: SkeletonProps) {
  const base = variantStyles[variant];

  if (lines > 1 && variant === "text") {
    return (
      <div className={`flex flex-col gap-2 ${className}`} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={`skeleton ${base}`}
            style={i === lines - 1 ? { width: "60%" } : undefined}
          />
        ))}
      </div>
    );
  }

  return <div className={`skeleton ${base} ${className}`} {...props} />;
}

export function SkeletonDashboard() {
  return (
    <div className="flex flex-col gap-5 p-6">
      <Skeleton variant="text" className="h-6 w-48" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Skeleton variant="stat" />
        <Skeleton variant="stat" />
        <Skeleton variant="stat" />
        <Skeleton variant="stat" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Skeleton variant="chart" />
        <Skeleton variant="chart" />
      </div>
      <Skeleton variant="card" className="h-64" />
    </div>
  );
}
