"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Bot,
  Wallet,
  Key,
  LogOut,
  Menu,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function isRouteActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/client") return pathname === "/client";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const clientNav: Array<{ href: string; label: string; subtitle: string; icon: LucideIcon }> = [
  { href: "/client", label: "Dashboard", subtitle: "Overview & activity", icon: LayoutDashboard },
  { href: "/client/agents", label: "My Agents", subtitle: "Status & sessions", icon: Bot },
  { href: "/client/costs", label: "Costs", subtitle: "Usage & billing", icon: Wallet },
  { href: "/client/api-keys", label: "API Keys", subtitle: "Integration tokens", icon: Key },
];

export function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [tenantName, setTenantName] = useState<string>("");
  const [tenantPlan, setTenantPlan] = useState<string>("");

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const res = await fetch("/api/client/dashboard", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tenant?: { name?: string; plan?: string } };
        if (mounted) {
          if (data.tenant?.name) setTenantName(data.tenant.name);
          if (data.tenant?.plan) setTenantPlan(data.tenant.plan);
        }
      } catch { /* silent */ }
    };
    run();
    return () => { mounted = false; };
  }, []);

  const handleLogout = () => {
    document.cookie = "mc_auth=; path=/; max-age=0";
    document.cookie = "mc_csrf=; path=/; max-age=0";
    document.cookie = "mc_role=; path=/; max-age=0";
    document.cookie = "mc_tenant=; path=/; max-age=0";
    document.cookie = "mc_user_session=; path=/; max-age=0";
    router.push("/login");
  };

  const currentPage = clientNav.find((item) => isRouteActive(pathname, item.href));

  const sidebar = (
    <div className="flex h-full flex-col bg-[var(--bg-primary)] text-[var(--text-secondary)]">
      <div className="border-b border-[var(--border)]/50 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[rgba(0,212,126,0.1)] text-[var(--accent)]">
            <span className="text-sm font-extrabold font-[family-name:var(--font-display)]">
              {tenantName?.charAt(0)?.toUpperCase() || "?"}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {tenantName || "Loading..."}
            </p>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
              {tenantPlan || "Client Portal"}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {clientNav.map((item) => {
            const active = isRouteActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-[rgba(0,212,126,0.08)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--text-tertiary)] group-hover:text-[var(--text-secondary)]"}`} />
                <div className="min-w-0 flex-1">
                  <span className="block">{item.label}</span>
                  <span className={`block text-[10px] ${active ? "text-[var(--accent)]/60" : "text-[var(--text-tertiary)]"}`}>
                    {item.subtitle}
                  </span>
                </div>
                {active && <ChevronRight className="h-3 w-3 text-[var(--accent)]/50" />}
              </Link>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--border)] p-3">
        <button
          type="button"
          onClick={handleLogout}
          className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition hover:bg-red-500/[0.06] hover:text-red-400"
        >
          <LogOut className="h-4 w-4 shrink-0" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[var(--border)] md:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-[var(--border)]/80 bg-[var(--bg-primary)]/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-primary)] md:hidden active:scale-95 transition-transform touch-manipulation"
                  aria-label="Open sidebar"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {currentPage?.label ?? "Client Portal"}
                  </p>
                  {currentPage?.subtitle && (
                    <p className="text-[10px] text-[var(--text-tertiary)]">{currentPage.subtitle}</p>
                  )}
                </div>
              </div>
              {tenantName && (
                <div className="hidden items-center gap-2 sm:flex">
                  <span className="text-xs text-[var(--text-tertiary)]">Powered by</span>
                  <span className="text-xs font-bold text-[var(--accent)] font-[family-name:var(--font-display)]">Arkon</span>
                </div>
              )}
            </div>
          </header>

          <main className="min-w-0 flex-1 px-4 pb-24 pt-4 sm:px-6 sm:pt-6 md:pb-6">
            <div className="mx-auto w-full max-w-5xl">
              {children}
            </div>
          </main>
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/60 cursor-pointer"
            role="button"
            aria-label="Close sidebar"
            tabIndex={-1}
            onKeyDown={(e) => { if (e.key === "Escape") setIsOpen(false); }}
          />
          <div className="relative h-full w-[280px] max-w-[85vw] border-r border-[var(--border)] shadow-[0_20px_60px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)]/80 bg-[var(--bg-primary)]/95 backdrop-blur md:hidden">
        <div className="mx-auto grid h-[60px] max-w-3xl grid-cols-4 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
          {clientNav.map((tab) => {
            const active = isRouteActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex min-h-11 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition ${
                  active ? "text-[var(--accent)]" : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
                }`}
              >
                <Icon className="mb-0.5 h-5 w-5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
