"use client";

import { useState, useEffect, type ReactNode } from "react";
import { Info, ChevronDown } from "lucide-react";

/* ── MetricTooltip ─────────────────────────────────────────────────────────── */

export function MetricTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen((p) => !p)}
        className="inline-flex items-center justify-center rounded-full p-0.5 text-[#555566] transition hover:text-[#94a3b8]"
        aria-label="More info"
      >
        <Info className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute bottom-full left-1/2 z-50 mb-2 w-56 -translate-x-1/2 rounded-xl border border-[#2E2E3A] bg-[#1A1A22] px-3 py-2.5 text-xs leading-relaxed text-[#cbd5e1] shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {text}
          <div className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#2E2E3A]" />
        </div>
      )}
    </span>
  );
}

/* ── HealthGauge — circular SVG gauge ──────────────────────────────────────── */

export function HealthGauge({
  score,
  color,
  breakdown,
  size = "md",
}: {
  score: number;
  color: string;
  breakdown: { agents: number; threats: number; budget: number; infra: number };
  size?: "md" | "lg";
}) {
  const [hover, setHover] = useState(false);
  const isLg = size === "lg";
  const svgSize = isLg ? 150 : 110;
  const center = svgSize / 2;
  const radius = isLg ? 58 : 42;
  const strokeW = isLg ? 10 : 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const scoreFontSize = isLg ? "36px" : "26px";
  const labelFontSize = isLg ? "11px" : "9px";
  const scoreY = isLg ? 68 : 50;
  const labelY = isLg ? 90 : 68;

  const gradeLabel =
    score >= 80 ? "Healthy" : score >= 50 ? "Needs Attention" : "Critical";

  return (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="drop-shadow-lg">
        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="#2E2E3A"
          strokeWidth={strokeW}
        />
        {/* Score arc */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeW}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
          className="transition-all duration-700 ease-out"
          style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
        />
        {/* Score text */}
        <text
          x={center}
          y={scoreY}
          textAnchor="middle"
          className="fill-[#E4E4ED] font-bold"
          style={{ fontSize: scoreFontSize, fontWeight: 800 }}
        >
          {score}
        </text>
        <text
          x={center}
          y={labelY}
          textAnchor="middle"
          className="fill-[#8888A0] uppercase tracking-widest"
          style={{ fontSize: labelFontSize, letterSpacing: "0.15em" }}
        >
          {gradeLabel}
        </text>
      </svg>

      {/* Tooltip breakdown on hover */}
      {hover && (
        <div className="absolute top-full z-50 mt-2 w-52 rounded-xl border border-[#2E2E3A] bg-[#1A1A22] p-3 shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#555566]">
            Score Breakdown
          </p>
          <BreakdownRow label="Agent Uptime" value={breakdown.agents} max={25} color="#00D47E" />
          <BreakdownRow label="Threat Level" value={breakdown.threats} max={25} color="#06B6D4" />
          <BreakdownRow label="Budget Status" value={breakdown.budget} max={25} color="#f59e0b" />
          <BreakdownRow label="Infrastructure" value={breakdown.infra} max={25} color="#3b82f6" />
        </div>
      )}
    </div>
  );
}

function BreakdownRow({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="flex justify-between text-[11px]">
        <span className="text-[#94a3b8]">{label}</span>
        <span className="font-semibold text-[#E4E4ED]">{value}/{max}</span>
      </div>
      <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-[#2E2E3A]">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${(value / max) * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

/* ── StatusSummary — natural-language dashboard summary ─────────────────── */

export function StatusSummary({
  totalAgents,
  activeAgents,
  eventsToday,
  threatCount,
  costToday,
  serverCount,
}: {
  totalAgents: number;
  activeAgents: number;
  eventsToday: number;
  threatCount: number;
  costToday?: string;
  serverCount?: number;
}) {
  if (totalAgents === 0) return null;

  const parts: ReactNode[] = [];

  // Agent summary
  const serverPart = serverCount && serverCount > 0
    ? <> across <strong className="text-[#E4E4ED]">{serverCount} server{serverCount !== 1 ? "s" : ""}</strong></>
    : null;
  parts.push(
    <span key="agents">
      You have <strong className="text-[#E4E4ED]">{totalAgents} agent{totalAgents !== 1 ? "s" : ""}</strong>
      {activeAgents > 0 ? <> (<strong className="text-[#00D47E]">{activeAgents} active</strong>)</> : null}
      {serverPart}.
    </span>
  );

  // Activity summary
  if (eventsToday > 0) {
    parts.push(
      <span key="events">
        {" "}<strong className="text-[#E4E4ED]">{eventsToday.toLocaleString()}</strong> event{eventsToday !== 1 ? "s" : ""} today
        {costToday ? <>, spending <strong className="text-[#f59e0b]">{costToday}</strong></> : null}.
      </span>
    );
  } else {
    parts.push(<span key="events"> No activity yet today.</span>);
  }

  // Threats
  if (threatCount > 0) {
    parts.push(
      <span key="threats">
        {" "}<strong className="text-[#ef4444]">{threatCount} threat{threatCount !== 1 ? "s" : ""} detected</strong> &mdash;{" "}
        <a href="/security" className="font-semibold text-[#00D47E] hover:underline">
          review now &rarr;
        </a>
      </span>
    );
  }

  return (
    <div className="rounded-[16px] border border-[#2E2E3A] bg-[#1A1A22]/80 px-4 py-3 text-sm leading-relaxed text-[#94a3b8]">
      {parts}
    </div>
  );
}

/* ── SectionDescription — collapsible page description header ──────────── */

const SECTION_SEEN_PREFIX = "arkon-section-seen-";

export function SectionDescription({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const storageKey = `${SECTION_SEEN_PREFIX}${id}`;
  const [expanded, setExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const seen = localStorage.getItem(storageKey);
    if (!seen) {
      setExpanded(true);
      localStorage.setItem(storageKey, "1");
    }
  }, [storageKey]);

  if (!mounted) return null;

  return (
    <div className="mb-4">
      {expanded ? (
        <div className="rounded-[14px] border border-[#2E2E3A]/60 bg-[#1A1A22]/60 px-4 py-3">
          <div className="text-sm leading-relaxed text-[#94a3b8]">{children}</div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="mt-2 text-[11px] font-semibold text-[#555566] transition hover:text-[#8888A0]"
          >
            Got it, hide this
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex items-center gap-1.5 text-[11px] font-semibold text-[#555566] transition hover:text-[#8888A0]"
        >
          <Info className="h-3 w-3" />
          What is this?
        </button>
      )}
    </div>
  );
}
