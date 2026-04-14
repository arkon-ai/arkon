"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Youtube,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Power,
} from "lucide-react";
import { SectionDescription } from "@/components/mission-control/dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";

interface Channel {
  id: number;
  name: string;
  url: string;
  collection_name: string;
  dir_name: string;
  max_videos: number;
  enabled: boolean;
  last_pull_at: string | null;
  last_pull_status: string | null;
  video_count: number;
  transcript_count: number;
  chunk_count: number;
}

interface StatusResponse {
  ok: boolean;
  collections?: Record<string, number | { error: string }>;
  error?: string;
  cached?: boolean;
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function YoutubeKbSettingsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newMaxVideos, setNewMaxVideos] = useState<number>(80);
  const [adding, setAdding] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const flash = useCallback((ok: boolean, message: string) => {
    setFeedback({ ok, message });
    setTimeout(() => setFeedback(null), 4000);
  }, []);

  const loadChannels = useCallback(async () => {
    const res = await fetch("/api/youtube-kb/channels?format=ui&all=true", { headers: getAuthHeaders() });
    if (!res.ok) {
      flash(false, "Failed to load channels");
      return;
    }
    const data = (await res.json()) as { channels: Channel[] };
    setChannels(data.channels);
  }, [flash]);

  const loadStatus = useCallback(async (refresh = false) => {
    setRefreshingStatus(true);
    try {
      const res = await fetch(`/api/youtube-kb/status${refresh ? "?refresh=true" : ""}`, {
        headers: getAuthHeaders(),
      });
      const data = (await res.json()) as StatusResponse;
      setStatus(data);
    } catch {
      setStatus({ ok: false, error: "Failed to fetch status" });
    } finally {
      setRefreshingStatus(false);
    }
  }, []);

  useEffect(() => {
    void loadChannels().then(() => setLoading(false));
    void loadStatus(false);
  }, [loadChannels, loadStatus]);

  // Merge live ChromaDB counts into channel rows for display.
  const rows = useMemo(() => {
    const counts = status?.collections ?? {};
    return channels.map((c) => {
      const live = counts[c.collection_name];
      const liveCount = typeof live === "number" ? live : null;
      return { ...c, live_chunks: liveCount };
    });
  }, [channels, status]);

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!newUrl.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/youtube-kb/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ url: newUrl.trim(), max_videos: newMaxVideos }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; channel?: Channel };
      if (!res.ok || !data.ok) {
        flash(false, data.error ?? "Failed to add channel");
      } else {
        flash(true, `Added ${data.channel?.name}`);
        setNewUrl("");
        setNewMaxVideos(80);
        await loadChannels();
      }
    } finally {
      setAdding(false);
    }
  }

  async function toggleEnabled(c: Channel) {
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/youtube-kb/channels/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ enabled: !c.enabled }),
      });
      if (!res.ok) {
        flash(false, "Failed to toggle");
      } else {
        await loadChannels();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function deleteChannel(c: Channel) {
    if (!confirm(`Remove "${c.name}"? This will NOT delete existing ChromaDB collections — it only stops future pulls.`)) {
      return;
    }
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/youtube-kb/channels/${c.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) {
        flash(false, "Failed to delete");
      } else {
        flash(true, `Removed ${c.name}`);
        await loadChannels();
      }
    } finally {
      setBusyId(null);
    }
  }

  async function updateMaxVideos(c: Channel, max: number) {
    setBusyId(c.id);
    try {
      const res = await fetch(`/api/youtube-kb/channels/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ max_videos: max }),
      });
      if (!res.ok) flash(false, "Failed to update");
      else await loadChannels();
    } finally {
      setBusyId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-secondary)]" />
      </div>
    );
  }

  const enabledCount = channels.filter((c) => c.enabled).length;
  const totalChunks = rows.reduce((sum, r) => sum + (r.live_chunks ?? r.chunk_count ?? 0), 0);

  return (
    <div className="space-y-6">
      <SectionDescription id="youtube-kb">
        Manage YouTube channels ingested into the knowledge base. The Dell G5 pipeline
        fetches this list daily at 3 AM SAST, downloads transcripts via yt-dlp, and embeds
        them into ChromaDB on EU-OPEN. Add a channel here and it will be ingested at the
        next run.
      </SectionDescription>

      {/* Summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Channels</p>
          <p className="text-xl font-semibold text-[var(--text-primary)]">{enabledCount} <span className="text-sm text-[var(--text-secondary)]">of {channels.length} enabled</span></p>
        </div>
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Total chunks (ChromaDB)</p>
          <p className="text-xl font-semibold text-[var(--text-primary)]">{totalChunks.toLocaleString()}</p>
        </div>
        <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">Status</p>
              <p className="text-sm text-[var(--text-primary)]">
                {status?.ok ? (status.cached ? "Cached (5 min)" : "Live") : status?.error ? "Error" : "—"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadStatus(true)}
              disabled={refreshingStatus}
              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2 py-1 text-[11px] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:opacity-50"
            >
              <RefreshCw className={`h-3 w-3 ${refreshingStatus ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
          {status?.error ? (
            <p className="mt-1 text-[11px] text-[var(--danger)]">{status.error}</p>
          ) : null}
        </div>
      </div>

      {/* Add form */}
      <form
        onSubmit={addChannel}
        className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-5"
      >
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)]/10">
            <Youtube className="h-5 w-5 text-[var(--accent)]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Add Channel</h3>
            <p className="text-[12px] text-[var(--text-secondary)]">Paste a YouTube channel URL (e.g. https://www.youtube.com/@handle/videos)</p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="url"
            required
            placeholder="https://www.youtube.com/@handle/videos"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[#555566] transition focus:border-[var(--accent)]/50 focus:outline-none"
          />
          <input
            type="number"
            min={1}
            max={500}
            value={newMaxVideos}
            onChange={(e) => setNewMaxVideos(Number.parseInt(e.target.value, 10) || 80)}
            title="Max videos to pull per run"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] transition focus:border-[var(--accent)]/50 focus:outline-none sm:w-28"
          />
          <button
            type="submit"
            disabled={adding || !newUrl.trim()}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent)]/90 disabled:opacity-50"
          >
            {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Add
          </button>
        </div>
      </form>

      {feedback ? (
        <div
          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] ${
            feedback.ok
              ? "border-[var(--accent)]/30 bg-[var(--accent)]/5 text-[var(--accent)]"
              : "border-[var(--danger)]/30 bg-[var(--danger)]/5 text-[var(--danger)]"
          }`}
        >
          {feedback.ok ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {feedback.message}
        </div>
      ) : null}

      {/* Channel table */}
      <div className="relative card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden">
        <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)]/50 text-left text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                <th className="px-4 py-3 font-medium">Channel</th>
                <th className="px-2 py-3 font-medium">Max</th>
                <th className="px-2 py-3 font-medium">Chunks</th>
                <th className="px-2 py-3 font-medium">Last Pull</th>
                <th className="px-2 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-[var(--border)]/30 last:border-0 hover:bg-white/[0.01]">
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)] transition"
                      >
                        {c.name}
                      </a>
                      <span className="text-[11px] text-[var(--text-tertiary)]">{c.collection_name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-3">
                    <input
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={c.max_videos}
                      onBlur={(e) => {
                        const v = Number.parseInt(e.target.value, 10);
                        if (Number.isFinite(v) && v !== c.max_videos) void updateMaxVideos(c, v);
                      }}
                      className="w-16 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[12px] text-[var(--text-primary)] focus:border-[var(--accent)]/50 focus:outline-none"
                    />
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)]">
                    {c.live_chunks !== null ? c.live_chunks.toLocaleString() : <span className="text-[var(--text-tertiary)]">—</span>}
                  </td>
                  <td className="px-2 py-3 text-[var(--text-secondary)]">{formatRelative(c.last_pull_at)}</td>
                  <td className="px-2 py-3">
                    {c.enabled ? (
                      <span className="rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                        Enabled
                      </span>
                    ) : (
                      <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-[10px] font-semibold text-[var(--text-tertiary)]">
                        Off
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void toggleEnabled(c)}
                        disabled={busyId === c.id}
                        title={c.enabled ? "Disable" : "Enable"}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)] disabled:opacity-50"
                      >
                        <Power className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteChannel(c)}
                        disabled={busyId === c.id}
                        title="Delete"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:border-[var(--danger)]/50 hover:text-[var(--danger)] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[12px] text-[var(--text-tertiary)]">
                    No channels yet. Add one above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
