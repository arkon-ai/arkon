"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bell,
  AlertTriangle,
  ShieldAlert,
  X,
  Activity,
  CheckCheck,
  Wallet,
  Bot,
  Server,
  Inbox,
  Workflow,
  Info,
  Settings,
} from "lucide-react";

interface Notification {
  id: number;
  type: string;
  severity: string;
  title: string;
  body: string | null;
  link: string | null;
  read: boolean;
  created_at: string;
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

function typeIcon(type: string, severity: string) {
  switch (type) {
    case "threat":
      return severity === "critical"
        ? <ShieldAlert className="h-4 w-4 text-[#ef4444]" />
        : <ShieldAlert className="h-4 w-4 text-[#f59e0b]" />;
    case "anomaly":
      return <AlertTriangle className="h-4 w-4 text-[#f59e0b]" />;
    case "approval":
      return <Inbox className="h-4 w-4 text-[#00D47E]" />;
    case "budget":
      return <Wallet className="h-4 w-4 text-[#f59e0b]" />;
    case "agent_offline":
      return <Bot className="h-4 w-4 text-[#64748b]" />;
    case "infra_offline":
      return <Server className="h-4 w-4 text-[#ef4444]" />;
    case "intake":
      return <Inbox className="h-4 w-4 text-[#00D47E]" />;
    case "workflow_failure":
      return <Workflow className="h-4 w-4 text-[#ef4444]" />;
    default:
      return <Info className="h-4 w-4 text-[#64748b]" />;
  }
}

function severityDot(severity: string) {
  if (severity === "critical") return "bg-[#ef4444]";
  if (severity === "warning") return "bg-[#f59e0b]";
  return "bg-[#00D47E]";
}

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications?limit=10", {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        notifications: Notification[];
        unread_count: number;
      };
      setNotifications(data.notifications);
      setUnreadCount(data.unread_count);
    } catch {
      // Silent
    }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchNotifications();
    const timer = window.setInterval(fetchNotifications, 30000);
    return () => window.clearInterval(timer);
  }, [fetchNotifications]);

  // Refresh when opened
  useEffect(() => {
    if (open) {
      setLoading(true);
      fetchNotifications().finally(() => setLoading(false));
    }
  }, [open, fetchNotifications]);

  // Close on click outside / Escape
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

  async function markRead(ids: number[]) {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "";
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
    setNotifications((prev) =>
      prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)),
    );
    setUnreadCount((prev) => Math.max(0, prev - ids.length));
  }

  async function markAllRead() {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "";
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": csrf,
      },
      body: JSON.stringify({ all: true }),
    }).catch(() => {});
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-[#64748b] hover:bg-white/[0.03] hover:text-[#e2e8f0] transition"
        aria-label={`${unreadCount} notifications`}
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute right-1 top-1 inline-flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-96 rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] shadow-[0_20px_60px_rgba(0,0,0,0.5)]">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#1a2a4a]/50 px-4 py-3">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#475569]">
              Notifications
              {unreadCount > 0 ? (
                <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[10px] font-bold text-red-400">
                  {unreadCount}
                </span>
              ) : null}
            </h3>
            <div className="flex items-center gap-1">
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  className="flex h-6 items-center gap-1 rounded-lg px-2 text-[10px] font-medium text-[#64748b] hover:text-[#00D47E] transition"
                  title="Mark all as read"
                >
                  <CheckCheck className="h-3 w-3" />
                  <span>Mark all read</span>
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-6 w-6 items-center justify-center rounded-lg text-[#475569] hover:text-[#e2e8f0] transition"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-96 overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-[#475569]">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
                <Activity className="h-5 w-5 text-[#00D47E]" />
                <p className="text-sm text-[#64748b]">All clear — no notifications</p>
              </div>
            ) : (
              <div className="py-1">
                {notifications.map((notif) => {
                  const inner = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3 transition hover:bg-white/[0.02] ${
                        !notif.read ? "bg-white/[0.01]" : ""
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">
                        {typeIcon(notif.type, notif.severity)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2">
                          <p className="text-sm text-[#e2e8f0] flex-1">
                            {!notif.read ? (
                              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${severityDot(notif.severity)}`} />
                            ) : null}
                            <span className={notif.read ? "text-[#94a3b8]" : "font-medium"}>
                              {notif.title}
                            </span>
                          </p>
                        </div>
                        {notif.body ? (
                          <p className="mt-0.5 text-[12px] text-[#64748b] line-clamp-2">
                            {notif.body}
                          </p>
                        ) : null}
                        <p className="mt-0.5 text-[11px] text-[#475569]">
                          {timeAgo(notif.created_at)}
                        </p>
                      </div>
                      {!notif.read ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void markRead([notif.id]);
                          }}
                          className="mt-0.5 shrink-0 rounded-lg p-1 text-[#475569] hover:text-[#e2e8f0] transition"
                          aria-label="Mark as read"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  );

                  return notif.link ? (
                    <Link
                      key={notif.id}
                      href={notif.link}
                      onClick={() => {
                        if (!notif.read) void markRead([notif.id]);
                        setOpen(false);
                      }}
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={notif.id}>{inner}</div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-[#1a2a4a]/50 px-4 py-2.5">
            <Link
              href="/activity"
              onClick={() => setOpen(false)}
              className="text-[12px] font-semibold text-[#00D47E] transition hover:text-[#00D47E]/80"
            >
              View all activity &rarr;
            </Link>
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="flex items-center gap-1 text-[12px] text-[#475569] transition hover:text-[#64748b]"
            >
              <Settings className="h-3 w-3" />
              <span>Settings</span>
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
