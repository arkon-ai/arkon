"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Radio,
  Bot,
  Server,
  Network,
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
  OctagonX,
  Settings,
  MessageSquare,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type PaletteItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  category: "page" | "agent" | "workflow" | "action";
  keywords?: string;
  action?: string;
};

const staticPages: PaletteItem[] = [
  { id: "p-overview", label: "Overview", href: "/", icon: LayoutDashboard, category: "page" },
  { id: "p-activity", label: "Activity Feed", href: "/activity", icon: Radio, category: "page" },
  { id: "p-agents", label: "Agents", href: "/agents", icon: Bot, category: "page" },
  { id: "p-systems", label: "Systems", href: "/systems", icon: Server, category: "page" },
  { id: "p-infra", label: "Infrastructure", href: "/infrastructure", icon: Network, category: "page" },
  { id: "p-security", label: "ThreatGuard", href: "/security", icon: ShieldCheck, category: "page", keywords: "threat guard security" },
  { id: "p-analytics", label: "Anomaly Detection", href: "/analytics", icon: BarChart3, category: "page" },
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
  { id: "p-settings", label: "Settings", href: "/settings", icon: Settings, category: "page" },
  { id: "p-victoryos", label: "VictoryOS", href: "/victoryos", icon: MessageSquare, category: "page" },
  { id: "a-kill", label: "Kill Active Agent", href: "", icon: OctagonX, category: "action", keywords: "kill stop emergency agent", action: "quick-kill" },
];

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

const categoryLabels: Record<string, string> = {
  action: "Actions",
  page: "Pages",
  agent: "Agents",
  workflow: "Workflows",
};

export function CommandPalette({
  open,
  onClose,
  onAction,
}: {
  open: boolean;
  onClose: () => void;
  onAction?: (action: string) => void;
}) {
  const router = useRouter();
  const [dynamicItems, setDynamicItems] = useState<PaletteItem[]>([]);

  // Fetch agents + workflows on open
  useEffect(() => {
    if (!open) return;

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

  const allItems = useMemo(() => [...staticPages, ...dynamicItems], [dynamicItems]);

  const select = useCallback(
    (item: PaletteItem) => {
      onClose();
      if (item.action && onAction) {
        onAction(item.action);
      } else if (item.href) {
        router.push(item.href);
      }
    },
    [onClose, router, onAction]
  );

  // Group items by category
  const grouped = useMemo(() => {
    const groups: Record<string, PaletteItem[]> = {};
    for (const item of allItems) {
      if (!groups[item.category]) groups[item.category] = [];
      groups[item.category].push(item);
    }
    return groups;
  }, [allItems]);

  if (!open) return null;

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
      <Command
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
        label="Command palette"
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <Command.Input
            placeholder="Search pages, agents, workflows..."
            className="flex-1 bg-transparent text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
            autoFocus
          />
          <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-tertiary)]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <Command.List className="max-h-[360px] overflow-y-auto p-2">
          <Command.Empty className="py-8 text-center text-sm text-[var(--text-tertiary)]">
            No results found.
          </Command.Empty>

          {(["action", "page", "agent", "workflow"] as const).map((cat) => {
            const items = grouped[cat];
            if (!items?.length) return null;
            return (
              <Command.Group
                key={cat}
                heading={categoryLabels[cat]}
                className="mb-1 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.2em] [&_[cmdk-group-heading]]:text-[var(--text-tertiary)]"
              >
                {items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <Command.Item
                      key={item.id}
                      value={`${item.label} ${item.keywords ?? ""}`}
                      onSelect={() => select(item)}
                      className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13px] text-[var(--text-secondary)] transition data-[selected=true]:bg-[rgba(0,212,126,0.08)] data-[selected=true]:text-[var(--text-primary)]"
                    >
                      <Icon className="h-4 w-4 shrink-0 [[data-selected=true]_&]:text-[var(--accent)]" />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Command.Item>
                  );
                })}
              </Command.Group>
            );
          })}
        </Command.List>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t border-[var(--border)] px-4 py-2 text-[10px] text-[var(--text-tertiary)]">
          <span><kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">&uarr;</kbd> <kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">&darr;</kbd> navigate</span>
          <span><kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">Enter</kbd> open</span>
          <span><kbd className="rounded border border-[var(--border)] bg-[var(--bg-primary)] px-1 py-0.5 text-[9px]">Esc</kbd> close</span>
        </div>
      </Command>
    </div>
  );
}
