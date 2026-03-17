"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import {
  LayoutDashboard,
  Bot,
  Wallet,
  LogOut,
  Menu,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

function isRouteActive(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === "/client") return pathname === "/client";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const clientNav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/client", label: "Dashboard", icon: LayoutDashboard },
  { href: "/client/agents", label: "My Agents", icon: Bot },
  { href: "/client/costs", label: "Costs", icon: Wallet },
];

export function ClientShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [tenantName, setTenantName] = useState<string>("");

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Fetch tenant name on mount
  useEffect(() => {
    let mounted = true;
    const run = async () => {
      try {
        const res = await fetch("/api/client/dashboard", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { tenant?: { name?: string } };
        if (mounted && data.tenant?.name) setTenantName(data.tenant.name);
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
    router.push("/login");
  };

  const sidebar = (
    <div className="flex h-full flex-col bg-[#080810] text-[#94a3b8]">
      <div className="flex h-14 items-center border-b border-[#1a2a4a]/50 px-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-[#475569]">
            Client Portal
          </p>
          <p className="mt-0.5 text-sm font-semibold text-[#e2e8f0]">
            {tenantName || "Loading..."}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-4">
        <section className="mb-4">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
            My Account
          </p>
          <div className="space-y-1">
            {clientNav.map((item) => {
              const active = isRouteActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-[rgba(6,214,160,0.08)] text-[#06d6a0]"
                      : "text-[#94a3b8] hover:bg-white/[0.03] hover:text-[#e2e8f0]"
                  }`}
                >
                  <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#06d6a0]" : "text-[#64748b]"}`} />
                  <span className="flex-1">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </section>

        <div className="mt-4 border-t border-[#1a2a4a] pt-4">
          <button
            type="button"
            onClick={handleLogout}
            className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-[#64748b] transition hover:bg-red-500/[0.06] hover:text-red-400"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#05050f] text-slate-200">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-[#1a2a4a] md:block">
          <div className="sticky top-0 h-screen">{sidebar}</div>
        </aside>

        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-40 border-b border-[#1a2a4a]/80 bg-[#05050f]/95 backdrop-blur">
            <div className="flex h-16 items-center justify-between px-4 sm:px-6">
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
                  <p className="text-sm font-semibold text-[#e2e8f0]">
                    {pathname === "/client" ? "Dashboard" : pathname === "/client/agents" ? "My Agents" : pathname === "/client/costs" ? "Costs" : "Client Portal"}
                  </p>
                </div>
              </div>
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
          <div className="relative h-full w-[280px] max-w-[85vw] border-r border-[#1a2a4a] shadow-[0_20px_60px_rgba(0,0,0,0.5)]" onClick={(e) => e.stopPropagation()}>
            {sidebar}
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[#1a2a4a]/80 bg-[#0a0a14]/95 backdrop-blur md:hidden">
        <div className="mx-auto grid h-[60px] max-w-3xl grid-cols-3 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2">
          {clientNav.map((tab) => {
            const active = isRouteActive(pathname, tab.href);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex min-h-11 flex-col items-center justify-center rounded-xl text-[10px] font-semibold transition ${
                  active
                    ? "text-[#06d6a0]"
                    : "text-[#64748b] hover:text-[#94a3b8]"
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
