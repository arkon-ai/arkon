"use client";

import { useEffect, useState, useCallback } from "react";
import { GlowingEffect } from "@/components/ui/glowing-effect";

interface Session {
  id: string;
  ip_address: string;
  user_agent: string;
  created_at: string;
  expires_at: string;
  is_current: boolean;
}

export default function SessionsPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const csrfCookie = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "";
      const res = await fetch("/api/auth/sessions", {
        headers: { "x-csrf-token": csrfCookie },
      });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch (err) {
      console.error("Failed to fetch sessions:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  async function revokeSession(id: string) {
    setRevoking(id);
    try {
      const csrfCookie = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "";
      await fetch(`/api/auth/sessions?id=${id}`, {
        method: "DELETE",
        headers: { "x-csrf-token": csrfCookie },
      });
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      console.error("Failed to revoke session:", err);
    } finally {
      setRevoking(null);
    }
  }

  async function revokeAll() {
    setRevoking("all");
    try {
      const csrfCookie = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "";
      await fetch("/api/auth/sessions?all=true", {
        method: "DELETE",
        headers: { "x-csrf-token": csrfCookie },
      });
      await fetchSessions();
    } catch (err) {
      console.error("Failed to revoke all sessions:", err);
    } finally {
      setRevoking(null);
    }
  }

  function parseUserAgent(ua: string): string {
    if (ua.includes("Firefox")) return "Firefox";
    if (ua.includes("Edg/")) return "Edge";
    if (ua.includes("Chrome")) return "Chrome";
    if (ua.includes("Safari")) return "Safari";
    if (ua.includes("curl")) return "curl";
    return ua.slice(0, 30);
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
            Active Sessions
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Manage your active login sessions across devices
          </p>
        </div>
        {sessions.length > 1 && (
          <button
            onClick={revokeAll}
            disabled={revoking === "all"}
            className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger)]/10 px-4 py-2 text-sm font-medium text-[var(--danger)] transition hover:bg-[var(--danger)]/20 disabled:opacity-50"
          >
            {revoking === "all" ? "Revoking..." : "Revoke All Others"}
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-2xl bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[var(--text-secondary)]">No active sessions found. You may be using passphrase auth.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div
              key={session.id}
              className="relative card-hover flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4"
            >
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <div className="space-y-1 relative z-10">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-[var(--text-primary)]">
                    {parseUserAgent(session.user_agent)}
                  </span>
                  {session.is_current && (
                    <span className="rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-xs font-medium text-[var(--accent)]">
                      Current
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                  <span>{session.ip_address}</span>
                  <span>Created {timeAgo(session.created_at)}</span>
                  <span>Expires {new Date(session.expires_at).toLocaleDateString()}</span>
                </div>
              </div>
              {!session.is_current && (
                <button
                  onClick={() => revokeSession(session.id)}
                  disabled={revoking === session.id}
                  className="relative z-10 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition hover:border-[var(--danger)]/50 hover:text-[var(--danger)] disabled:opacity-50"
                >
                  {revoking === session.id ? "Revoking..." : "Revoke"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
