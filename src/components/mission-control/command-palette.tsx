"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard,
  Radio,
  Bot,
  Server,
  Network,
  HeartPulse,
  ShieldCheck,
  BarChart3,
  Wallet,
  Terminal,
  CheckCircle,
  ListTodo,
  Clock,
  Activity,
  Workflow as WorkflowIcon,
  FileText,
  Plug,
  Globe,
  Inbox,
  Calendar,
  Gauge,
  Shield,
  Lock,
  Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  category: "page" | "agent" | "workflow";
  keywords?: string;
};

const staticPages: PaletteItem[] = [
  { id: "p-overview", label: "Overview", href: "/", icon: LayoutDashboard, category: "page" },
  { id: "p-activity", label: "Activity Feed", href: "/activity", icon: Radio, category: "page" },
  { id: "p-agents", label: "Agents", href: "/agents", icon: Bot, category: "page" },
  { id: "p-systems", label: "Systems", href: "/systems", icon: Server, category: "page" },
  { id: "p-infra", label: "Infrastructure", href: "/infrastructure", icon: Network, category: "page" },
  { id: "p-health", label: "Health", href: "/health", icon: HeartPulse, category: "page" },
  { id: "p-security", label: "ThreatGuard", href: "/security", icon: ShieldCheck, category: "page", keywords: "threat guard security" },
  { id: "p-analytics", label: "Analytics", href: "/analytics", icon: BarChart3, category: "page" },
  { id: "p-costs", label: "Cost Tracker", href: "/costs", icon: Wallet, category: "page", keywords: "cost money spending" },
  { id: "p-command", label: "Command", href: "/tools/command", icon: Terminal, category: "page" },
  { id: "p-approvals", label: "Approvals", href: "/tools/approvals", icon: CheckCircle, category: "page" },
  { id: "p-tasks", label: "Tasks", href: "/tools/tasks", icon: ListTodo, category: "page" },
  { id: "p-crons", label: "Cron Jobs", href: "/tools/crons", icon: Clock, category: "page", keywords: "cron schedule timer" },
  { id: "p-live", label: "Live Agents", href: "/tools/agents-live", icon: Activity, category: "page" },
  { id: "p-workflows", label: "Workflows", href: "/workflows", icon: WorkflowIcon, category: "page" },
  { id: "p-docs", label: "Docs", href: "/tools/docs", icon: FileText, category: "page", keywords: "documents files workspace" },
  { id: "p-mcp", label: "MCP Servers", href: "/tools/mcp", icon: Plug, category: "page" },
  { id: "p-gateway", label: "MCP Gateway", href: "/tools/mcp-gateway", icon: Globe, category: "page" },
  { id: "p-intake", label: "Intake", href: "/tools/intake", icon: Inbox, category: "page" },
  { id: "p-calendar", label: "Calendar", href: "/tools/calendar", icon: Calendar, category: "page" },
  { id: "p-benchmarks", label: "Benchmarks", href: "/benchmarks", icon: Gauge, category: "page", keywords: "benchmark model compare" },
  { id: "p-compliance", label: "Compliance", href: "/compliance", icon: Shield, category: "page", keywords: "audit export purge gdpr" },
  { id: "p-admin", label: "Admin Panel", href: "/admin", icon: Lock, category: "page" },
];

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

function fuzzyMatch(query: string, text: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();

  // Exact substring match — highest score
  if (t.includes(q)) return { match: true, score: 100 - t.indexOf(q) };

  // Fuzzy character matching
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      score += 10;
      // Bonus for consecutive matches
      if (ti > 0 && t[ti - 1] === q[qi - 1]) score += 5;
      qi++;
    }
  }

  return { match: qi === q.length, score };
}

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-[#06d6a0] font-semibold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  );
}

const categoryLabels: Record<string, string> = {
  page: "Pages",
  agent: "Agents",
  workflow: "Workflows",
};

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [dynamicItems, setDynamicItems] = useState<PaletteItem[]>([]);

  // Fetch agents + workflows on open
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIndex(0);

    const headers = getAuthHeaders();

    Promise.allSettled([
      fetch("/api/agents", { headers }).then((r) => r.json()),
      fetch("/api/workflows", { headers }).then((r) => r.json()),
    ]).then(([agentsResult, workflowsResult]) => {
      const items: PaletteItem[] = [];

      if (agentsResult.status === "fulfilled") {
        const agents = (agentsResult.value as { agents?: Array<{ id: string; name: string }> }).agents ?? [];
        for (const agent of agents) {
          items.push({
            id: `a-${agent.id}`,
            label: agent.name,
            href: `/agent/${agent.id}`,
            icon: Bot,
            category: "agent",
          });
        }
      }

      if (workflowsResult.status === "fulfilled") {
        const workflows = (workflowsResult.value as { workflows?: Array<{ id: string; name: string }> }).workflows ?? [];
        for (const wf of workflows) {
          items.push({
            id: `w-${wf.id}`,
            label: wf.name,
            href: `/workflows?id=${wf.id}`,
            icon: WorkflowIcon,
            category: "workflow",
          });
        }
      }

      setDynamicItems(items);
    });
  }, [open]);

  // Focus input on open
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const allItems = useMemo(() => [...staticPages, ...dynamicItems], [dynamicItems]);

  const filtered = useMemo(() => {
    if (!query.trim()) return allItems;
    const results: Array<PaletteItem & { score: number }> = [];
    for (const item of allItems) {
      const labelMatch = fuzzyMatch(query, item.label);
      const keywordMatch = item.keywords ? fuzzyMatch(query, item.keywords) : { match: false, score: 0 };
      const best = labelMatch.score >= keywordMatch.score ? labelMatch : keywordMatch;
      if (best.match) {
        results.push({ ...item, score: best.score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }, [query, allItems]);

  // Reset active index when results change
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector("[data-active='true']");
    if (active) active.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  const select = useCallback(
    (item: PaletteItem) => {
      onClose();
      router.push(item.href);
    },
    [onClose, router]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter" && filtered[activeIndex]) {
        e.preventDefault();
        select(filtered[activeIndex]);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [activeIndex, filtered, select, onClose]
  );

  if (!open) return null;

  // Group results by category
  const grouped: Array<{ category: string; items: typeof filtered }> = [];
  const seen = new Set<string>();
  for (const item of filtered) {
    if (!seen.has(item.category)) {
      seen.add(item.category);
      grouped.push({ category: item.category, items: [] });
    }
    grouped.find((g) => g.category === item.category)?.items.push(item);
  }

  let globalIndex = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[min(20vh,160px)]">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        role="button"
        aria-label="Close command palette"
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[#1a2a4a] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[#475569]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, agents, workflows..."
            className="flex-1 bg-transparent text-sm text-[#e2e8f0] outline-none placeholder:text-[#475569]"
          />
          <kbd className="rounded border border-[#1a2a4a] bg-[#050510] px-1.5 py-0.5 text-[10px] font-medium text-[#475569]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[360px] overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#475569]">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.category} className="mb-1">
                <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#475569]">
                  {categoryLabels[group.category] ?? group.category}
                </p>
                {group.items.map((item) => {
                  const idx = globalIndex++;
                  const isActive = idx === activeIndex;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-active={isActive}
                      onClick={() => select(item)}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] transition ${
                        isActive
                          ? "bg-[rgba(6,214,160,0.08)] text-[#e2e8f0]"
                          : "text-[#94a3b8] hover:bg-white/[0.03]"
                      }`}
                    >
                      <Icon className={`h-4 w-4 shrink-0 ${isActive ? "text-[#06d6a0]" : "text-[#64748b]"}`} />
                      <span className="flex-1 truncate">{highlightMatch(item.label, query)}</span>
                      {isActive ? (
                        <span className="text-[10px] text-[#475569]">Enter to open</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-[#1a2a4a] px-4 py-2 text-[10px] text-[#475569]">
          <span><kbd className="rounded border border-[#1a2a4a] bg-[#050510] px-1 py-0.5 text-[9px]">&uarr;</kbd> <kbd className="rounded border border-[#1a2a4a] bg-[#050510] px-1 py-0.5 text-[9px]">&darr;</kbd> navigate</span>
          <span><kbd className="rounded border border-[#1a2a4a] bg-[#050510] px-1 py-0.5 text-[9px]">Enter</kbd> open</span>
          <span><kbd className="rounded border border-[#1a2a4a] bg-[#050510] px-1 py-0.5 text-[9px]">Esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
