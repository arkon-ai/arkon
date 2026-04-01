"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ShellHeader, Card, SectionTitle } from "./dashboard";
import { SkeletonCard } from "./charts";
import { GlowingEffect } from "@/components/ui/glowing-effect";

/* ─── Types ─────────────────────────────────────────────── */
type CronJob = {
  id: string;
  name: string | null;
  enabled: boolean;
  schedule_kind: string | null;
  schedule_expr: string | null;
  schedule_tz: string | null;
  session_target: string | null;
  payload_kind: string | null;
  payload_message: string | null;
  payload_model: string | null;
  delivery_mode: string | null;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  consecutive_errors: number;
  synced_at: string | null;
};

/* ─── Auth ───────────────────────────────────────────────── */
function getHeaders(includeCSRF = false): Record<string, string> {
  const token = typeof document !== "undefined"
    ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "")
    : "";
  const csrf = typeof document !== "undefined"
    ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (includeCSRF && csrf) h["x-csrf-token"] = csrf;
  return h;
}

/* ─── Helpers ────────────────────────────────────────────── */
function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const s = Math.floor(abs / 1000);
  if (s < 60) return future ? `in ${s}s` : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return future ? `in ${m}m` : `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return future ? `in ${h}h` : `${h}h ago`;
  const d = Math.floor(h / 24);
  return future ? `in ${d}d` : `${d}d ago`;
}

function statusColour(status: string | null, errors: number): string {
  if (errors >= 3) return "text-red-400";
  if (status === "ok" || status === "success") return "text-[var(--accent)]";
  if (status === "error") return "text-red-400";
  if (status === "running") return "text-[var(--warning)] animate-pulse";
  return "text-[var(--text-secondary)]";
}

function scheduleLabel(job: CronJob): string {
  if (!job.schedule_kind) return "No schedule";
  if (job.schedule_kind === "cron" && job.schedule_expr) {
    return `Cron: ${job.schedule_expr}${job.schedule_tz ? ` (${job.schedule_tz})` : ""}`;
  }
  if (job.schedule_kind === "every" && job.schedule_expr) return job.schedule_expr;
  if (job.schedule_kind === "at" && job.schedule_expr) return `Once: ${job.schedule_expr}`;
  return job.schedule_kind;
}

/* ─── Message Modal ──────────────────────────────────────── */
function MessageModal({ job, onClose }: { job: CronJob; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/crons", {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({ action: "message", jobId: job.id, message: text }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Send failed");
      toast.success("Message logged — Agent will see it in the Activity Feed and action it");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-bold text-[var(--text-primary)]">Message Agent</h3>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">
          About: <span className="text-[var(--accent)]">{job.name ?? job.id}</span> · {scheduleLabel(job)}
        </p>

        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Your message</div>
        <div className="relative card-hover mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/70 px-3 py-2 text-xs text-[var(--text-secondary)]">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[var(--text-secondary)] font-medium mb-1">Suggestions:</p>
          <ul className="space-y-1">
            {["Change the schedule to run at 8AM daily", "Disable this cron job", "Delete this cron job", "Run this cron job right now", "Change the model to Fast"].map((s) => (
              <li key={s}>
                <button onClick={() => setText(s)} className="text-left hover:text-[var(--accent)] transition">→ {s}</button>
              </li>
            ))}
          </ul>
        </div>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          placeholder="What would you like Agent to do with this cron job?"
          className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition"
          onKeyDown={(e) => { if (e.key === "Enter" && e.metaKey) void send(); }}
        />
        <p className="mb-4 mt-1 text-[10px] text-[var(--text-secondary)]">⌘+Enter to send</p>

        <div className="flex gap-2">
          <button
            onClick={() => void send()}
            disabled={busy || !text.trim()}
            className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? "Sending…" : "Send to Agent"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Cron Job Card ──────────────────────────────────────── */
function CronCard({ job, onMessage, onAction }: {
  job: CronJob;
  onMessage: () => void;
  onAction: (action: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div layout className={`relative card-hover rounded-2xl border px-4 py-4 transition ${job.enabled ? "border-[var(--border)] bg-[var(--bg-primary)]/70" : "border-[var(--border)]/50 bg-[var(--bg-primary)]/40 opacity-60"}`}>
      <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1" onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-bold ${job.enabled ? "text-[var(--accent)]" : "text-[var(--text-secondary)]"}`}>
              {job.enabled ? "● ACTIVE" : "○ DISABLED"}
            </span>
            {job.consecutive_errors >= 3 && (
              <span className="rounded-full bg-red-900/30 px-2 py-0.5 text-[10px] font-bold text-red-400">
                {job.consecutive_errors} ERRORS
              </span>
            )}
          </div>
          <h3 className="mt-1 text-sm font-semibold text-[var(--text-primary)] truncate">
            {job.name ?? job.id}
          </h3>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{scheduleLabel(job)}</p>
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={onMessage}
            className="rounded-xl border border-[var(--accent)]/30 px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:bg-[rgba(0,212,126,0.08)] transition"
          >
            Message Agent
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-secondary)]">
        <div>
          <span className="text-[10px] uppercase tracking-wider">Last run</span>
          <div className="text-[var(--text-secondary)]">{fmtRelative(job.last_run_at)}</div>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider">Next run</span>
          <div className="text-[var(--text-secondary)]">{fmtRelative(job.next_run_at)}</div>
        </div>
        <div>
          <span className="text-[10px] uppercase tracking-wider">Status</span>
          <div className={statusColour(job.last_status, job.consecutive_errors)}>
            {job.last_status ?? "—"}
          </div>
        </div>
        {job.payload_model && (
          <div>
            <span className="text-[10px] uppercase tracking-wider">Model</span>
            <div className="text-[var(--text-secondary)]">{job.payload_model}</div>
          </div>
        )}
      </div>

      {/* Error */}
      {job.last_error && (
        <div className="mt-2 rounded-xl border border-red-500/20 bg-[rgba(239,68,68,0.05)] px-3 py-2 text-xs text-red-400">
          ⚠️ {job.last_error}
        </div>
      )}

      {/* Expanded — payload preview + quick actions */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {job.payload_message && (
              <div className="relative card-hover mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Payload Preview</p>
                <p className="line-clamp-4 text-xs text-[var(--text-secondary)]">{job.payload_message}</p>
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() => onAction("run")}
                className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition"
              >
                ▶ Run Now
              </button>
              {job.enabled ? (
                <button
                  onClick={() => onAction("disable")}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-amber-400 hover:border-amber-500/30 transition"
                >
                  ⏸ Disable
                </button>
              ) : (
                <button
                  onClick={() => onAction("enable")}
                  className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition"
                >
                  ▶ Enable
                </button>
              )}
              <button
                onClick={() => onAction("delete")}
                className="rounded-xl border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-[rgba(239,68,68,0.08)] transition"
              >
                🗑 Delete
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
export function CronManager() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "disabled" | "errors">("all");
  const [messageJob, setMessageJob] = useState<CronJob | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/crons", { headers: getHeaders() });
      const data = await res.json() as { jobs: CronJob[] };
      setJobs(data.jobs ?? []);
      if (data.jobs?.[0]?.synced_at) setLastSync(data.jobs[0].synced_at);
    } catch {
      toast.error("Failed to load cron jobs");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchJobs(); }, [fetchJobs]);

  const handleAction = async (job: CronJob, action: string) => {
    if (action === "delete" && !confirm(`Delete cron job "${job.name ?? job.id}"? This cannot be undone.`)) return;

    try {
      const res = await fetch("/api/admin/crons", {
        method: "PATCH",
        headers: getHeaders(true),
        body: JSON.stringify({ jobId: job.id, action }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`"${action}" instruction logged — Agent will pick it up from the Activity Feed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    }
  };

  const filtered = jobs.filter((j) => {
    if (filter === "active") return j.enabled;
    if (filter === "disabled") return !j.enabled;
    if (filter === "errors") return j.consecutive_errors >= 1;
    return true;
  });

  const errorCount = jobs.filter((j) => j.consecutive_errors >= 1).length;

  if (loading) return <div className="space-y-4 pb-24"><SkeletonCard /><SkeletonCard /></div>;

  return (
    <div className="space-y-5 pb-24">
      <ShellHeader
        title="Cron Jobs"
        subtitle="All scheduled tasks running on your OpenClaw gateway"
        action={
          <div className="text-right text-xs text-[var(--text-secondary)]">
            {lastSync && <div>Synced {fmtRelative(lastSync)}</div>}
            <div className="text-[10px] text-[var(--text-tertiary)]">{jobs.length} total jobs</div>
          </div>
        }
      />

      {jobs.length === 0 ? (
        <Card>
          <div className="py-12 text-center">
            <p className="text-sm text-[var(--text-secondary)]">No cron jobs synced yet.</p>
            <p className="mt-2 text-xs text-[var(--text-tertiary)]">
              Run the sync script on your Dell to push OpenClaw cron jobs here:
            </p>
            <code className="mt-2 block rounded-xl bg-[var(--bg-primary)] px-4 py-2 text-xs text-[var(--accent)]">
              python3 ~/.openclaw/workspace/scripts/sync-crons-to-mc.py
            </code>
          </div>
        </Card>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: `All (${jobs.length})` },
              { key: "active", label: `Active (${jobs.filter(j => j.enabled).length})` },
              { key: "disabled", label: `Disabled (${jobs.filter(j => !j.enabled).length})` },
              { key: "errors", label: `Errors (${errorCount})`, danger: errorCount > 0 },
            ].map(({ key, label, danger }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? danger ? "bg-red-500/20 text-red-400" : "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Job cards */}
          <div className="space-y-3">
            {filtered.map((job) => (
              <CronCard
                key={job.id}
                job={job}
                onMessage={() => setMessageJob(job)}
                onAction={(action) => void handleAction(job, action)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--text-secondary)]">No jobs match this filter</div>
            )}
          </div>
        </>
      )}

      {/* Message modal */}
      <AnimatePresence>
        {messageJob && (
          <MessageModal job={messageJob} onClose={() => setMessageJob(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}
