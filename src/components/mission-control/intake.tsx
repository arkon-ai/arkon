"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ShellHeader, Card } from "./dashboard";
import { SkeletonCard } from "./charts";
import { SectionDescription } from "./dashboard-clarity";

/* ─── Types ─────────────────────────────────────────────── */
type IntakeSubmission = {
  id: number;
  full_name: string;
  email: string | null;
  client_label: string | null;
  processed: boolean;
  submitted_at: string;
  priorities: string | null;
  automation_wish: string | null;
  channels: string[] | null;
  ssh_comfort: string | null;
  exec_access: string | null;
  payload?: Record<string, unknown>;
};

/* ─── Auth ───────────────────────────────────────────────── */
function getHeaders(csrf = false): Record<string, string> {
  const token = typeof document !== "undefined"
    ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "")
    : "";
  const csrfToken = typeof document !== "undefined"
    ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (csrf && csrfToken) h["x-csrf-token"] = csrfToken;
  return h;
}

/* ─── Helpers ────────────────────────────────────────────── */
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

const channelEmoji: Record<string, string> = {
  telegram: "📱", whatsapp: "💬", discord: "🎮", signal: "🔒",
};

/* ─── Full payload modal ─────────────────────────────────── */
// Human-readable labels for known payload keys
const FIELD_LABELS: Record<string, string> = {
  full_name: "Full Name",
  email: "Email",
  client: "Client / Org",
  client_label: "Client Label",
  submitted_at: "Submitted",
  channels: "Channels",
  ssh_comfort: "SSH Comfort",
  exec_access: "Exec Access",
  priorities: "Top Priorities",
  automation_wish: "Automation Wish",
  role: "Role",
  team: "Team Size",
  tools: "Current Tools",
  faith: "Faith",
  family: "Family",
  personality: "Personality",
  comm_style: "Comm Style",
  great_day: "Great Day Looks Like",
  assistant_name: "Assistant Name",
  assistant_vibe: "Assistant Vibe",
  hated_tasks: "Most Hated Tasks",
  data_limits: "Data Limits",
};

// Ordered display — show these first, then everything else from payload
const FIELD_ORDER = [
  "full_name","email","client","assistant_name","assistant_vibe",
  "role","team","family","faith","personality","comm_style",
  "tools","channels","hated_tasks","great_day","priorities",
  "automation_wish","data_limits","ssh_comfort","exec_access",
];

function PayloadModal({ sub, onClose }: { sub: IntakeSubmission; onClose: () => void }) {
  // Merge typed fields with raw payload
  const raw: Record<string, unknown> = {
    ...(sub.payload ?? {}),
    full_name: sub.full_name,
    email: sub.email,
    client_label: sub.client_label,
    channels: sub.channels,
    ssh_comfort: sub.ssh_comfort,
    exec_access: sub.exec_access,
    priorities: sub.priorities,
    automation_wish: sub.automation_wish,
  };

  // Build ordered list
  const seen = new Set<string>();
  const fields: [string, string][] = [];

  const addField = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    const v = raw[k];
    if (v == null || v === "" || v === "—") return;
    const label = FIELD_LABELS[k] ?? k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const display = Array.isArray(v) ? v.join(", ") : String(v).slice(0, 600);
    fields.push([label, display]);
  };

  // First: ordered known fields
  for (const k of FIELD_ORDER) addField(k);
  // Then: any remaining payload fields
  for (const k of Object.keys(raw)) addField(k);
  // Add submitted_at last
  fields.push(["Submitted", fmtDate(sub.submitted_at)]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-[var(--text-primary)]">{sub.full_name}</h3>
          <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition text-xl">×</button>
        </div>

        <div className="space-y-3">
          {fields.map(([label, value]) => (
            <div key={label}>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{label}</p>
              <p className="mt-0.5 text-sm text-[var(--text-primary)] whitespace-pre-wrap">{value}</p>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Submission Card ────────────────────────────────────── */
function SubmissionCard({ sub, onProcessed, onExpand }: {
  sub: IntakeSubmission;
  onProcessed: () => void;
  onExpand: () => void;
}) {
  const [marking, setMarking] = useState(false);

  const markProcessed = async () => {
    setMarking(true);
    try {
      const res = await fetch(`/api/intake?id=${sub.id}`, {
        method: "PATCH",
        headers: getHeaders(true),
        body: JSON.stringify({ processed: true }),
      });
      if (!res.ok) throw new Error("Failed");
      toast.success("Marked as processed");
      onProcessed();
    } catch {
      toast.error("Failed to update");
    } finally {
      setMarking(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border px-4 py-4 transition ${sub.processed ? "border-[var(--border)]/50 bg-[var(--bg-primary)]/40 opacity-70" : "border-[var(--accent)]/30 bg-[var(--bg-primary)]/80"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {!sub.processed && (
              <span className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)] animate-pulse">
                NEW
              </span>
            )}
            <span className="text-sm font-semibold text-[var(--text-primary)]">{sub.full_name}</span>
            {sub.email && <span className="text-xs text-[var(--text-secondary)]">{sub.email}</span>}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{fmtDate(sub.submitted_at)}</p>
          {sub.client_label && (
            <p className="mt-0.5 text-xs text-[var(--accent)]">{sub.client_label}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-1.5">
          <button
            onClick={onExpand}
            className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition"
          >
            View All
          </button>
          {!sub.processed && (
            <button
              onClick={() => void markProcessed()}
              disabled={marking}
              className="rounded-xl bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition"
            >
              {marking ? "…" : "✓ Done"}
            </button>
          )}
        </div>
      </div>

      {/* Key fields preview */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {sub.channels && sub.channels.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Channels</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              {(sub.channels as string[]).map(c => `${channelEmoji[c.toLowerCase()] ?? "💬"} ${c}`).join(" · ")}
            </p>
          </div>
        )}
        {sub.ssh_comfort && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Technical</p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{sub.ssh_comfort}</p>
          </div>
        )}
        {sub.priorities && (
          <div className="sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Top Priorities</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{sub.priorities}</p>
          </div>
        )}
        {sub.automation_wish && (
          <div className="sm:col-span-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Automation Wish</p>
            <p className="mt-0.5 line-clamp-2 text-xs text-[var(--text-secondary)]">{sub.automation_wish}</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
export function IntakeViewer() {
  const [submissions, setSubmissions] = useState<IntakeSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "new" | "processed">("all");
  const [expanded, setExpanded] = useState<IntakeSubmission | null>(null);

  const fetchSubmissions = useCallback(async () => {
    try {
      const res = await fetch("/api/intake", { headers: getHeaders() });
      const data = await res.json() as { submissions: IntakeSubmission[] };
      setSubmissions(data.submissions ?? []);
    } catch {
      toast.error("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchSubmissions(); }, [fetchSubmissions]);

  const filtered = submissions.filter((s) => {
    if (filter === "new") return !s.processed;
    if (filter === "processed") return s.processed;
    return true;
  });

  const newCount = submissions.filter((s) => !s.processed).length;

  if (loading) return <div className="space-y-4 pb-24"><SkeletonCard /><SkeletonCard /></div>;

  return (
    <div className="space-y-5 pb-24">
      <ShellHeader
        title="Intake Submissions"
        subtitle="DFY client onboarding form responses"
        action={
          <div className="text-right text-xs text-[var(--text-secondary)]">
            <div>{submissions.length} total</div>
            {newCount > 0 && (
              <div className="text-[var(--accent)] font-semibold">{newCount} unprocessed</div>
            )}
          </div>
        }
      />
      <SectionDescription id="intake">
        Manage client onboarding submissions. When new clients fill out the intake form, their information appears here for review. Process submissions to provision new tenants and agents.
      </SectionDescription>

      {submissions.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">📋</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">No submissions yet</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Share the intake form with your client:
            </p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Configure your intake form URL in Settings.
            </p>
          </div>
        </Card>
      ) : (
        <>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: `All (${submissions.length})` },
              { key: "new", label: `New (${newCount})`, highlight: newCount > 0 },
              { key: "processed", label: `Processed (${submissions.filter(s => s.processed).length})` },
            ].map(({ key, label, highlight }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : highlight
                    ? "border border-[var(--accent)]/40 text-[var(--accent)] animate-pulse"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.map((sub) => (
              <SubmissionCard
                key={sub.id}
                sub={sub}
                onProcessed={fetchSubmissions}
                onExpand={() => setExpanded(sub)}
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--text-secondary)]">No submissions match this filter</div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {expanded && <PayloadModal sub={expanded} onClose={() => setExpanded(null)} />}
      </AnimatePresence>
    </div>
  );
}
