"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { PageTransitionWrapper } from "./charts";
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
  Workflow,
  FileText,
  Plug,
  Globe,
  Inbox,
  Calendar,
  Gauge,
  Shield,
  Lock,
  Bell,
  LogOut,
  Menu,
  Home,
  Wrench,
  MoreHorizontal,
  ChevronDown,
  Star,
  Search,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CommandPalette } from "./command-palette";
import { NotificationDropdown } from "./notification-dropdown";
import { ActiveRunBanner } from "./active-run-banner";
import { QuickKillDialog } from "./quick-kill-dialog";
import { GuidedTour } from "./guided-tour";

const pageLabels: Record<string, string> = {
  "/": "Dashboard",
  "/tools": "Tools",
  "/tools/approvals": "Approvals",
  "/tools/docs": "Docs",
  "/tools/tasks": "Tasks",
  "/tools/calendar": "Calendar",
  "/tools/agents-live": "Live Agents",
  "/workflows": "Workflows",
  "/tools/command": "Command",
  "/security": "ThreatGuard",
  "/analytics": "Anomaly Detection",
  "/costs": "Costs",
  "/agents": "Agents",
  "/systems": "Infrastructure",
  "/confessions": "Confessions",
  "/visuals": "Visuals",
  "/actions": "Actions",
  "/activity": "Activity",
  "/tools/crons": "Cron Jobs",
  "/tools/intake": "Client Intake",
  "/tools/mcp": "MCP Servers",
  "/tools/mcp-gateway": "MCP Gateway",
  "/admin": "Admin Panel",
  "/infrastructure": "Infrastructure",
  "/benchmarks": "Benchmarks",
  "/compliance": "Compliance",
  "/client": "Client Portal",
  "/client/agents": "Client Agents",
  "/client/events": "Client Events",
  "/client/costs": "Client Costs",
  "/settings": "Settings",
};

type NavItem = {
  href: string;
  label: string;
  subtitle?: string;
  icon: LucideIcon;
};

const mobileTabs: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/", label: "Home", icon: Home },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "##more##", label: "More", icon: MoreHorizontal },
];

const moreSheetItems: NavItem[] = [
  { href: "/infrastructure", label: "Infrastructure", icon: Network },
  { href: "/activity", label: "Activity", icon: Radio },
  { href: "/tools/crons", label: "Cron Jobs", icon: Clock },
  { href: "/tools/command", label: "Command", icon: Terminal },
  { href: "/tools/intake", label: "Client Intake", icon: Inbox },
  { href: "/tools/mcp", label: "MCP Servers", icon: Plug },
  { href: "/admin", label: "Admin Panel", icon: Lock },
];

const navGroups: Array<{ label: string; key: string; items: NavItem[] }> = [
  {
    label: "Monitor",
    key: "monitor",
    items: [
      { href: "/", label: "Dashboard", subtitle: "Overview & health score", icon: LayoutDashboard },
      { href: "/activity", label: "Activity", subtitle: "Real-time event stream", icon: Radio },
      { href: "/agents", label: "Agents", subtitle: "Manage your AI agents", icon: Bot },
      { href: "/infrastructure", label: "Infrastructure", subtitle: "Monitor your servers", icon: Network },
      { href: "/security", label: "ThreatGuard", subtitle: "Detect threats in agent activity", icon: ShieldCheck },
      { href: "/analytics", label: "Anomaly Detection", subtitle: "Rate spike & silence alerts", icon: BarChart3 },
      { href: "/costs", label: "Costs", subtitle: "Track spending by agent & model", icon: Wallet },
    ],
  },
  {
    label: "Operate",
    key: "operate",
    items: [
      { href: "/tools/command", label: "Command", subtitle: "Run agent commands", icon: Terminal },
      { href: "/tools/approvals", label: "Approvals", subtitle: "Review pending agent requests", icon: CheckCircle },
      { href: "/tools/tasks", label: "Tasks", subtitle: "Track action items", icon: ListTodo },
      { href: "/tools/crons", label: "Cron Jobs", subtitle: "Scheduled automations", icon: Clock },
      { href: "/tools/agents-live", label: "Live Agents", subtitle: "Active agent sessions", icon: Activity },
      { href: "/workflows", label: "Workflows", subtitle: "Automate operations", icon: Workflow },
    ],
  },
  {
    label: "Configure",
    key: "configure",
    items: [
      { href: "/tools/docs", label: "Docs", subtitle: "Agent documentation", icon: FileText },
      { href: "/tools/mcp", label: "MCP Servers", subtitle: "Manage tool providers", icon: Plug },
      { href: "/tools/mcp-gateway", label: "MCP Gateway", subtitle: "Secure external tools", icon: Globe },
      { href: "/tools/intake", label: "Client Intake", subtitle: "Client onboarding forms", icon: Inbox },
      { href: "/tools/calendar", label: "Calendar", subtitle: "Schedule & events", icon: Calendar },
      { href: "/settings", label: "Settings", subtitle: "Notifications & preferences", icon: Settings },
    ],
  },
  {
    label: "Analyze",
    key: "analyze",
    items: [
      { href: "/benchmarks", label: "Benchmarks", subtitle: "Compare agent performance", icon: Gauge },
      { href: "/compliance", label: "Compliance", subtitle: "Audit logs & data export", icon: Shield },
    ],
  },
  {
    label: "Admin",
    key: "admin",
    items: [
      { href: "/admin", label: "Admin Panel", subtitle: "System configuration", icon: Lock },
    ],
  },
];

/* ── localStorage-persisted collapsed state ── */

const NAV_COLLAPSED_KEY = "mc-nav-collapsed";
const DEFAULT_EXPANDED = new Set(["monitor", "operate"]);

function loadCollapsedGroups(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(NAV_COLLAPSED_KEY);
    if (!raw) {
      // Default: collapse everything except Monitor and Operate
      const collapsed = new Set<string>();
      for (const g of navGroups) {
        if (!DEFAULT_EXPANDED.has(g.key)) collapsed.add(g.key);
      }
      return collapsed;
    }
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveCollapsedGroups(collapsed: Set<string>) {
  try {
    localStorage.setItem(NAV_COLLAPSED_KEY, JSON.stringify([...collapsed]));
  } catch {
    // Silent
  }
}

/* ── Pinned docs for Quick Access ── */

type PinnedDoc = {
  id: number;
  title: string;
  category: string;
  file_path: string | null;
};

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

/* ── Tour target IDs for guided tour ── */
const TOUR_IDS: Record<string, string> = {
  "/": "dashboard",
  "/agents": "nav-agents",
  "/security": "nav-threatguard",
  "/costs": "nav-costs",
  "/workflows": "nav-workflows",
};

function isRouteActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function NotionShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  // alertCount removed — NotificationDropdown now self-manages via /api/notifications
  const [isOpen, setIsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => loadCollapsedGroups());
  const [pinnedDocs, setPinnedDocs] = useState<PinnedDoc[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickKillOpen, setQuickKillOpen] = useState(false);

  // Skip shell chrome for login and setup pages
  if (pathname === "/login" || pathname?.startsWith("/setup")) {
    return <>{children}</>;
  }

  // First-run detection: redirect to setup wizard if not completed
  useEffect(() => {
    let mounted = true;
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data: { needs_setup?: boolean }) => {
        if (mounted && data.needs_setup) {
          router.replace("/setup");
        }
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [router]);

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  // Auto-expand group containing active route
  useEffect(() => {
    if (!pathname) return;
    for (const group of navGroups) {
      const hasActive = group.items.some((item) => isRouteActive(pathname, item.href));
      if (hasActive && collapsedGroups.has(group.key)) {
        setCollapsedGroups((prev) => {
          const next = new Set(prev);
          next.delete(group.key);
          saveCollapsedGroups(next);
          return next;
        });
      }
    }
  }, [pathname]);

  // Fetch pending approvals
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const response = await fetch("/api/tools/approvals?status=pending&limit=1", {
          headers: getAuthHeaders(),
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = (await response.json()) as { pendingCount?: number };
        if (!mounted) return;
        setPendingCount(payload.pendingCount ?? 0);
      } catch {
        if (!mounted) return;
        setPendingCount(null);
      }
    };
    run();
    const timer = window.setInterval(run, 15000);
    return () => { mounted = false; window.clearInterval(timer); };
  }, []);

  // Alert count polling removed — NotificationDropdown self-manages via /api/notifications

  // Fetch pinned docs (max 3 for Quick Access)
  useEffect(() => {
    let mounted = true;
    fetch("/api/tools/docs?pinned=true&limit=3", { headers: getAuthHeaders() })
      .then((r) => r.json())
      .then((d: { items?: PinnedDoc[] }) => {
        if (mounted) setPinnedDocs((d.items ?? []).slice(0, 3));
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, []);

  // Cmd+K listener (command palette) + Ctrl+Shift+K (quick kill)
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        setQuickKillOpen((prev) => !prev);
      } else if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    setIsOpen(false);
    setMoreOpen(false);
  }, [pathname]);

  const handleNavSelect = () => {
    setIsOpen(false);
  };

  const handleLogout = () => {
    document.cookie = "mc_auth=; path=/; max-age=0";
    document.cookie = "mc_csrf=; path=/; max-age=0";
    document.cookie = "mc_role=; path=/; max-age=0";
    router.push("/login");
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-[#080810] text-[#94a3b8]">
      <div className="flex h-14 items-center border-b border-[#1a2a4a]/50 px-4">
        <div className="flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#475569]">
            Arkon
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#e2e8f0]">Workspace</p>
        </div>
      </div>

      {/* Search trigger */}
      <div className="px-2 pt-3 pb-1">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex min-h-9 w-full items-center gap-2.5 rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-1.5 text-[12px] text-[#475569] transition hover:border-[#2a3a5a] hover:text-[#64748b]"
        >
          <Search className="h-3.5 w-3.5" />
          <span className="flex-1 text-left">Search</span>
          <kbd className="rounded border border-[#1a2a4a] bg-[#050510] px-1.5 py-0.5 text-[10px] font-medium text-[#475569]">
            {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "\u2318K" : "Ctrl+K"}
          </kbd>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2">
        {navGroups.map((group) => {
          const isCollapsed = collapsedGroups.has(group.key);
          return (
            <section key={group.key} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.key)}
                className="flex min-h-8 w-full items-center gap-1.5 rounded-lg px-3 py-1.5 text-left transition hover:bg-white/[0.02]"
              >
                <ChevronDown
                  className={`h-3 w-3 text-[#475569] transition-transform duration-200 ${
                    isCollapsed ? "-rotate-90" : ""
                  }`}
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-[#475569]">
                  {group.label}
                </span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-200 ease-in-out ${
                  isCollapsed ? "max-h-0 opacity-0" : "max-h-[500px] opacity-100"
                }`}
              >
                <div className="space-y-0.5 pb-1">
                  {group.items.map((item) => {
                    const active = isRouteActive(pathname, item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={handleNavSelect}
                        data-tour={TOUR_IDS[item.href]}
                        className={`flex min-h-9 items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] font-medium transition ${
                          active
                            ? "bg-[rgba(6,214,160,0.08)] text-[#06d6a0]"
                            : "text-[#94a3b8] hover:bg-white/[0.03] hover:text-[#e2e8f0]"
                        }`}
                      >
                        <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#06d6a0]" : "text-[#64748b]"}`} />
                        <div className="min-w-0 flex-1">
                          <span>{item.label}</span>
                          {item.subtitle && (
                            <span className="block truncate text-[10px] font-normal text-[#475569]">{item.subtitle}</span>
                          )}
                        </div>
                        {item.href === "/tools/approvals" && pendingCount && pendingCount > 0 ? (
                          <span className="rounded-full bg-[#f59e0b] px-1.5 py-0.5 text-[9px] font-bold text-[#050510]">
                            {pendingCount > 9 ? "9+" : pendingCount}
                          </span>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}

        {/* Quick Access — pinned docs (max 3) */}
        {pinnedDocs.length > 0 ? (
          <>
            <div className="my-2 border-t border-[#1a2a4a]/50" />
            <section>
              <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#475569]">
                Quick Access
              </p>
              <div className="space-y-0.5">
                {pinnedDocs.map((doc) => (
                  <Link
                    key={`pinned-${doc.id}`}
                    href={`/tools/docs?id=${doc.id}`}
                    onClick={handleNavSelect}
                    className="flex min-h-9 w-full items-center gap-2 rounded-xl px-3 py-1.5 text-left text-[13px] text-[#94a3b8] transition hover:bg-white/[0.03] hover:text-[#e2e8f0]"
                  >
                    <Star className="h-3.5 w-3.5 shrink-0 text-[#f59e0b]" />
                    <span className="min-w-0 flex-1 truncate">{doc.title}</span>
                  </Link>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <div className="mt-2 border-t border-[#1a2a4a]/50 pt-2">
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-9 w-full items-center gap-2.5 rounded-xl px-3 py-1.5 text-[13px] font-medium text-[#64748b] transition hover:bg-red-500/[0.06] hover:text-red-400"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#050510] text-[#e2e8f0]">
      <div className="flex min-h-screen">
        <aside className="hidden w-60 shrink-0 border-r border-[#1a2a4a]/50 md:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-[#1a2a4a]/50 bg-[#050510]/95 backdrop-blur">
            <div className="flex h-14 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] text-[#e2e8f0] md:hidden active:scale-95 transition-transform touch-manipulation"
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-sm font-semibold text-[#e2e8f0]">{pageLabels[pathname ?? ""] ?? "Arkon"}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPaletteOpen(true)}
                  className="hidden md:flex h-10 items-center gap-2 rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] px-3 text-[12px] text-[#475569] transition hover:border-[#2a3a5a] hover:text-[#64748b]"
                >
                  <Search className="h-3.5 w-3.5" />
                  <span>Search</span>
                  <kbd className="ml-2 rounded border border-[#1a2a4a] bg-[#050510] px-1.5 py-0.5 text-[10px] font-medium">
                    {typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent) ? "\u2318K" : "Ctrl+K"}
                  </kbd>
                </button>
                <NotificationDropdown />
              </div>
            </div>
          </header>

          <ActiveRunBanner />

          <main className="min-w-0 flex-1 px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pt-6 md:pb-6">
            <div className="mx-auto w-full max-w-6xl">
              <PageTransitionWrapper pathname={pathname ?? "/"}>
                {children}
              </PageTransitionWrapper>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile sidebar drawer */}
      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/70 cursor-pointer"
            role="button"
            aria-label="Close sidebar"
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === "Escape") setIsOpen(false); }}
          />
          <div className="relative h-full w-[272px] max-w-[85vw] border-r border-[#1a2a4a]/50 shadow-[0_20px_60px_rgba(0,0,0,0.6)]" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      ) : null}

      {/* Mobile more sheet */}
      {moreOpen ? (
        <div className="fixed inset-0 z-[45] md:hidden">
          <div
            onClick={() => setMoreOpen(false)}
            className="absolute inset-0 bg-black/50 cursor-pointer"
            role="button"
            aria-label="Close more menu"
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === "Escape") setMoreOpen(false); }}
          />
          <div className="absolute inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] mx-3 rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
            <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#475569]">
              More
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {moreSheetItems.map((item) => {
                const active = isRouteActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={`flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${
                      active
                        ? "bg-[rgba(6,214,160,0.08)] text-[#06d6a0]"
                        : "text-[#94a3b8] hover:bg-white/[0.03] hover:text-[#e2e8f0]"
                    }`}
                  >
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#06d6a0]" : "text-[#64748b]"}`} />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#1a2a4a]/50 bg-[#080810]/95 backdrop-blur md:hidden">
        <div className="mx-auto grid h-[56px] max-w-3xl grid-cols-5 px-2 pb-[max(env(safe-area-inset-bottom),4px)] pt-1">
          {mobileTabs.map((tab) => {
            if (tab.href === "##more##") {
              const Icon = tab.icon;
              return (
                <button
                  key="more"
                  type="button"
                  onClick={() => setMoreOpen(!moreOpen)}
                  className={`flex min-h-10 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition ${
                    moreOpen ? "text-[#06d6a0]" : "text-[#64748b] hover:text-[#94a3b8]"
                  }`}
                >
                  <Icon className="mb-0.5 h-5 w-5" />
                  <span>{tab.label}</span>
                </button>
              );
            }
            const active = isRouteActive(pathname, tab.href);
            const Icon = tab.icon;

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex min-h-10 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition ${
                  active
                    ? "text-[#06d6a0]"
                    : "text-[#64748b] hover:text-[#94a3b8]"
                }`}
              >
                <span className="relative mb-0.5">
                  <Icon className="h-5 w-5" />
                  {tab.href === "/tools" && pendingCount && pendingCount > 0 ? (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex min-h-3.5 min-w-3.5 items-center justify-center rounded-full bg-[#f59e0b] px-0.5 text-[8px] font-bold text-[#050510]">
                      {pendingCount > 9 ? "9+" : pendingCount}
                    </span>
                  ) : null}
                </span>
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Command Palette */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onAction={(action) => {
          if (action === "quick-kill") setQuickKillOpen(true);
        }}
      />

      {/* Quick Kill Dialog (Ctrl+Shift+K) */}
      <QuickKillDialog open={quickKillOpen} onClose={() => setQuickKillOpen(false)} />

      {/* Guided Tour (activated by ?tour=1 after setup wizard) */}
      <GuidedTour />
    </div>
  );
}
