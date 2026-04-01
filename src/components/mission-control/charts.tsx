"use client";

import { AnimatePresence, motion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { GlowingEffect } from "@/components/ui/glowing-effect";

/* ─────────────────────────────────────────
   StatCountUp — animated count-up number
───────────────────────────────────────── */
export function StatCountUp({
  value,
  suffix = "",
  decimals = 0,
}: {
  value: number;
  suffix?: string;
  decimals?: number;
}) {
  const count = useMotionValue(0);
  const spring = useSpring(count, { stiffness: 50, damping: 14 });
  const display = useTransform(spring, (v) =>
    decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()
  );

  useEffect(() => {
    count.set(value);
  }, [value, count]);

  return (
    <motion.span suppressHydrationWarning>
      <motion.span>{display}</motion.span>
      {suffix}
    </motion.span>
  );
}

/* ─────────────────────────────────────────
   PulsingDot — animated status indicator
───────────────────────────────────────── */
const dotColors: Record<string, string> = {
  live: "#00D47E",
  warm: "#f59e0b",
  idle: "#8888A0",
  error: "#ef4444",
};

export function PulsingDot({ status }: { status: "live" | "warm" | "idle" | "error" }) {
  const color = dotColors[status] ?? dotColors.idle;
  const shouldPulse = status === "live" || status === "error";

  return (
    <span className="relative inline-flex h-2.5 w-2.5 flex-shrink-0">
      {shouldPulse && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
          style={{ backgroundColor: color }}
        />
      )}
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: color }}
      />
    </span>
  );
}

/* ─────────────────────────────────────────
   StatusRing — SVG ring status indicator
───────────────────────────────────────── */
const ringColors: Record<string, string> = {
  live: "#00D47E",
  warm: "#f59e0b",
  idle: "#8888A0",
  error: "#ef4444",
};

const ringFill: Record<string, number> = {
  live: 1,
  warm: 0.75,
  idle: 0.4,
  error: 1,
};

export function StatusRing({
  status,
  size = 32,
}: {
  status: "live" | "warm" | "idle" | "error";
  size?: number;
}) {
  const color = ringColors[status] ?? ringColors.idle;
  const fill = ringFill[status] ?? 0.4;
  const r = (size - 4) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - fill);
  const animClass =
    status === "live" ? "ring-spin" : status === "error" ? "ring-pulse-fast" : status === "warm" ? "ring-pulse" : "";

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className={animClass}
        style={{ width: size, height: size }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="#1E1E2A"
          strokeWidth={2.5}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span
        className="absolute rounded-full"
        style={{
          width: size * 0.3,
          height: size * 0.3,
          backgroundColor: color,
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────
   Sparkline — tiny inline area chart
───────────────────────────────────────── */
export function Sparkline({
  data,
  dataKey = "value",
  color = "#00D47E",
  width = 80,
  height = 28,
}: {
  data: Array<Record<string, number>>;
  dataKey?: string;
  color?: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length === 0) return null;

  const gradId = `spark-${color.replace("#", "")}`;

  return (
    <ResponsiveContainer width={width} height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey={dataKey}
          stroke={color}
          strokeWidth={1.5}
          fill={`url(#${gradId})`}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────
   LiveBadge
───────────────────────────────────────── */
export function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,212,126,0.1)] px-2 py-0.5 text-xs font-semibold text-[var(--accent)]">
      <PulsingDot status="live" />
      LIVE
    </span>
  );
}

/* ─────────────────────────────────────────
   Custom chart tooltip
───────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 text-[var(--text-secondary)]">{label}</p>
      <p className="font-semibold text-[var(--text-primary)]">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

/* ─────────────────────────────────────────
   EventsAreaChart — 7-day cyan area chart
───────────────────────────────────────── */
export function EventsAreaChart({ data }: { data: Array<{ day: string; events: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="eventsGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00D47E" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00D47E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="events"
          stroke="#00D47E"
          strokeWidth={2}
          fill="url(#eventsGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#00D47E", strokeWidth: 0, style: { filter: "drop-shadow(0 0 6px rgba(0,212,126,0.5))" } }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────
   TokensAreaChart — 7-day purple area chart
───────────────────────────────────────── */
export function TokensAreaChart({ data }: { data: Array<{ day: string; tokens: number }> }) {
  return (
    <ResponsiveContainer width="100%" height={120}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
        <defs>
          <linearGradient id="tokensGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#00D47E" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#00D47E" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" vertical={false} />
        <XAxis dataKey="day" tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip content={<ChartTooltip />} />
        <Area
          type="monotone"
          dataKey="tokens"
          stroke="#00D47E"
          strokeWidth={2}
          fill="url(#tokensGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "#00D47E", strokeWidth: 0, style: { filter: "drop-shadow(0 0 6px rgba(0,212,126,0.5))" } }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────
   AgentBarChart — horizontal bar chart
───────────────────────────────────────── */
export function AgentBarChart({ agents }: { agents: Array<{ name: string; events: number }> }) {
  const sorted = [...agents].sort((a, b) => b.events - a.events).slice(0, 6);
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2A" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#8888A0", fontSize: 10 }} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: "#8888A0", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={72}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(0,212,126,0.05)" }} />
        <Bar dataKey="events" radius={[0, 6, 6, 0]}>
          {sorted.map((_, i) => (
            <Cell
              key={i}
              fill={`rgba(0,212,126,${0.9 - i * 0.1})`}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─────────────────────────────────────────
   SkeletonCard — shimmer placeholder
───────────────────────────────────────── */
export function SkeletonCard({ lines = 3, height = "h-20" }: { lines?: number; height?: string }) {
  return (
    <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <div className="skeleton mb-3 h-4 w-1/3 rounded-lg" />
      <div className={`skeleton ${height} w-full rounded-xl`} />
      {lines > 1 && Array.from({ length: lines - 1 }).map((_, i) => (
        <div key={i} className="skeleton mt-2 h-3 rounded-lg" style={{ width: `${75 - i * 15}%` }} />
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────
   PageTransitionWrapper — route transitions
───────────────────────────────────────── */
export function PageTransitionWrapper({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        className="h-full"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/* ─────────────────────────────────────────
   CardEntranceWrapper — staggered entrance
───────────────────────────────────────── */
export function CardEntranceWrapper({
  children,
  index = 0,
}: {
  children: ReactNode;
  index?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, delay: index * 0.05, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
