"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  X,
  Activity,
} from "lucide-react";

interface Alert {
  id: string;
  agent_name: string;
  anomaly_type: string;
  level: string;
  detected_at: string;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function NotificationDropdown({
  alertCount,
}: {
  alertCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch alerts when opened
  useEffect(() => {
    if (!open) return;
    let mounted = true;
    setLoading(true);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    fetch(`/api/dashboard/anomalies?unacknowledged=true&limit=5`, {
      headers: getAuthHeaders(),
      cache: "no-store",
    })
      .then((r) => r.json())
      .then((d: { anomalies?: Alert[] }) => {
        if (mounted) setAlerts(d.anomalies ?? []);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  function dismissAlert(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "";
    const token = document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "";
    fetch("/api/dashboard/anomalies", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({ id }),
    }).catch(() => {
      setDismissed((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    });
  }

  const visibleAlerts = alerts.filter((a) => !dismissed.has(a.id));
  const displayCount = Math.max(alertCount - dismissed.size, 0);

  function alertIcon(level: string) {
    if (level === "high") return <ShieldAlert className="h-4 w-4 text-[#ef4444]" />;
    return <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />;
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#64748b] hover:bg-white/[0.03] hover:text-[#e2e8f0] transition"
        aria-label={`${displayCount} notifications`}
      >
        <Bell className="h-5 w-5" />
        {displayCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {displayCount > 9 ? "9+" : displayCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-80 rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1a2a4a]/50 px-4 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#475569]">
              Notifications
            </h3>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded-lg text-[#475569] hover:text-[#e2e8f0] transition"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Content */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-sm text-[#475569]">
                Loading...
              </div>
            ) : visibleAlerts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Activity className="h-5 w-5 text-[#06d6a0]" />
                <p className="text-sm text-[#64748b]">All clear — no active alerts</p>
              </div>
            ) : (
              <div className="py-1">
                {visibleAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-3 px-4 py-3 transition hover:bg-white/[0.02]"
                  >
                    <div className="mt-0.5 shrink-0">{alertIcon(alert.level)}</div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-[#e2e8f0]">
                        <span className="font-medium">{alert.agent_name}</span>
                        <span className="text-[#64748b]">
                          {" "}
                          — {alert.anomaly_type.replace(/_/g, " ")}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#475569]">
                        {timeAgo(alert.detected_at)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissAlert(alert.id)}
                      className="mt-0.5 shrink-0 rounded-lg p-1 text-[#475569] hover:text-[#e2e8f0] transition"
                      aria-label="Dismiss"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-[#1a2a4a]/50 px-4 py-2.5">
            <Link
              href="/activity"
              onClick={() => setOpen(false)}
              className="text-[12px] font-semibold text-[#06d6a0] transition hover:text-[#06d6a0]/80"
            >
              View all activity &rarr;
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
