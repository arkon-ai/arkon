"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, Building2, Check, Globe } from "lucide-react";
import { useTenantFilter } from "./tenant-context";

interface Tenant {
  id: string;
  name: string;
  plan: string;
  agent_count?: number;
}

const PLAN_COLORS: Record<string, string> = {
  starter: "#06B6D4",
  growth: "#00D47E",
  enterprise: "#F59E0B",
};

export function TenantSwitcher() {
  const { activeTenant, setActiveTenant } = useTenantFilter();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("viewer");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const match = document.cookie.match(/mc_role=([^;]+)/);
    if (match?.[1]) setRole(decodeURIComponent(match[1]));
  }, []);

  const isOwner = role === "owner" || role === "admin";

  useEffect(() => {
    if (!isOwner) return;
    let mounted = true;
    fetch("/api/admin/tenants", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { tenants: [] }))
      .then((data: { tenants?: Tenant[] }) => {
        if (mounted) setTenants(data.tenants ?? []);
      })
      .catch(() => {});
    return () => { mounted = false; };
  }, [isOwner]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!isOwner || tenants.length === 0) return null;

  const currentTenant = tenants.find((t) => t.id === activeTenant);
  const label = currentTenant?.name ?? "All Tenants";
  const planColor = currentTenant ? (PLAN_COLORS[currentTenant.plan] ?? "#8888A0") : "#00D47E";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex h-9 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--text-primary)] transition hover:border-[rgba(0,212,126,0.25)]"
      >
        <div className="flex h-5 w-5 items-center justify-center rounded-md" style={{ backgroundColor: `${planColor}15` }}>
          {currentTenant ? (
            <Building2 className="h-3 w-3" style={{ color: planColor }} />
          ) : (
            <Globe className="h-3 w-3 text-[var(--accent)]" />
          )}
        </div>
        <span className="max-w-[120px] truncate">{label}</span>
        <ChevronDown className={`h-3 w-3 text-[var(--text-tertiary)] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
          <p className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
            Switch Tenant
          </p>

          <button
            type="button"
            onClick={() => { setActiveTenant(null); setOpen(false); }}
            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
              !activeTenant
                ? "bg-[rgba(0,212,126,0.08)] text-[var(--accent)]"
                : "text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
            }`}
          >
            <Globe className="h-3.5 w-3.5 shrink-0" />
            <span className="flex-1 font-medium">All Tenants</span>
            {!activeTenant && <Check className="h-3 w-3" />}
          </button>

          <div className="my-1 border-t border-[var(--border)]" />

          {tenants.map((t) => {
            const color = PLAN_COLORS[t.plan] ?? "#8888A0";
            const active = activeTenant === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => { setActiveTenant(t.id); setOpen(false); }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition ${
                  active
                    ? "bg-[rgba(0,212,126,0.08)] text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
                }`}
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-md" style={{ backgroundColor: `${color}15` }}>
                  <span className="text-[10px] font-bold" style={{ color }}>{t.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{t.name}</span>
                  <span className="block text-[10px] text-[var(--text-tertiary)]">{t.plan}</span>
                </div>
                {active && <Check className="h-3 w-3 shrink-0 text-[var(--accent)]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
