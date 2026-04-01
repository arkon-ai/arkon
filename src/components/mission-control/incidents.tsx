"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  Send,
  Shield,
  ShieldAlert,
  User,
  X,
  Zap,
} from "lucide-react";
import { SectionDescription } from "@/components/mission-control/dashboard-clarity";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { usePollingFetch, timeAgo } from "@/components/mission-control/api";

/* ── Types ── */

interface Incident {
  id: number;
  tenant_id: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  assigned_to: string | null;
  created_by: string;
  source_type: string | null;
  source_id: string | null;
  sla_deadline: string | null;
  sla_breached: boolean;
  resolved_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  update_count?: number;
}

interface IncidentUpdate {
  id: number;
  incident_id: number;
  update_type: string;
  content: string | null;
  author: string;
  previous_value: string | null;
  new_value: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface IncidentStats {
  open_count: number;
  critical_count: number;
  sla_breaches: number;
  avg_resolution_hours: number | null;
}

interface ListData {
  incidents: Incident[];
  stats: IncidentStats;
  count: number;
}

interface DetailData {
  incident: Incident;
  updates: IncidentUpdate[];
  sla: { deadline: string | null; remaining_ms: number | null; breached: boolean };
}

/* ── Constants ── */

const SEVERITY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  P1: { label: "P1 \u2014 Critical", color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
  P2: { label: "P2 \u2014 High", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  P3: { label: "P3 \u2014 Medium", color: "#06B6D4", bg: "rgba(6,182,212,0.1)" },
  P4: { label: "P4 \u2014 Low", color: "#64748b", bg: "rgba(100,116,139,0.1)" },
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  created: { label: "Created", color: "#8888A0", bg: "rgba(136,136,160,0.1)" },
  assigned: { label: "Assigned", color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  investigating: { label: "Investigating", color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  resolved: { label: "Resolved", color: "#00D47E", bg: "rgba(0,212,126,0.1)" },
  postmortem: { label: "Post-Mortem", color: "#a855f7", bg: "rgba(168,85,247,0.1)" },
  closed: { label: "Closed", color: "#555566", bg: "rgba(85,85,102,0.1)" },
};

const UPDATE_ICONS: Record<string, typeof Zap> = {
  status_change: Zap,
  severity_change: ShieldAlert,
  assignment: User,
  comment: MessageSquare,
  postmortem: Shield,
};

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof document !== "undefined") {
    const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1];
    if (csrf) headers["x-csrf-token"] = decodeURIComponent(csrf);
  }
  return headers;
}

function formatSla(ms: number | null, breached: boolean): { text: string; color: string } {
  if (ms === null) return { text: "No SLA", color: "#555566" };
  if (breached || ms <= 0) {
    const hrs = Math.abs(ms) / 3600000;
    return {
      text: `Breached by ${hrs >= 1 ? `${Math.floor(hrs)}h ${Math.floor((hrs % 1) * 60)}m` : `${Math.floor(Math.abs(ms) / 60000)}m`}`,
      color: "#ef4444",
    };
  }
  const hrs = ms / 3600000;
  if (hrs < 0.25) return { text: `${Math.floor(ms / 60000)}m left`, color: "#ef4444" };
  if (hrs < 1) return { text: `${Math.floor(ms / 60000)}m left`, color: "#f59e0b" };
  return { text: `${Math.floor(hrs)}h ${Math.floor((hrs % 1) * 60)}m left`, color: "#00D47E" };
}

/* ── Main Screen ── */

export function IncidentScreen() {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [severityFilter, setSeverityFilter] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  if (selectedId !== null) {
    return <IncidentDetail id={selectedId} onBack={() => setSelectedId(null)} />;
  }

  return (
    <IncidentList
      statusFilter={statusFilter}
      severityFilter={severityFilter}
      onStatusFilter={setStatusFilter}
      onSeverityFilter={setSeverityFilter}
      onSelect={setSelectedId}
      onCreateOpen={() => setShowCreate(true)}
      showCreate={showCreate}
      onCreateClose={() => setShowCreate(false)}
    />
  );
}

/* ── List View ── */

function IncidentList({
  statusFilter,
  severityFilter,
  onStatusFilter,
  onSeverityFilter,
  onSelect,
  onCreateOpen,
  showCreate,
  onCreateClose,
}: {
  statusFilter: string;
  severityFilter: string;
  onStatusFilter: (v: string) => void;
  onSeverityFilter: (v: string) => void;
  onSelect: (id: number) => void;
  onCreateOpen: () => void;
  showCreate: boolean;
  onCreateClose: () => void;
}) {
  const url = `/api/incidents?status=${statusFilter}${severityFilter ? `&severity=${severityFilter}` : ""}`;
  const { data, loading } = usePollingFetch<ListData>(url, 15000);

  const stats = data?.stats;
  const incidents = data?.incidents ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-[var(--text-primary)]">Incidents</h1>
          <p className="text-sm text-[var(--text-secondary)]">Track and resolve operational incidents</p>
        </div>
        <button
          type="button"
          onClick={onCreateOpen}
          className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] btn-press"
        >
          <Plus className="h-4 w-4" />
          Create Incident
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Open", value: stats.open_count, color: "#f59e0b" },
            { label: "P1/P2 Active", value: stats.critical_count, color: "#ef4444" },
            { label: "SLA Breaches", value: stats.sla_breaches, color: "#ef4444" },
            { label: "Avg Resolution", value: stats.avg_resolution_hours ? `${stats.avg_resolution_hours}h` : "\u2014", color: "#00D47E" },
          ].map((s) => (
            <div key={s.label} className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{s.label}</p>
              <p className="mt-1 text-2xl font-extrabold font-display" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <select
          value={severityFilter}
          onChange={(e) => onSeverityFilter(e.target.value)}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50 focus:outline-none"
        >
          <option value="">All Severities</option>
          {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </div>

      {/* Incident list */}
      {loading && incidents.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : incidents.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Shield className="mb-4 h-12 w-12 text-[var(--text-tertiary)]" />
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">No incidents</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">All systems nominal. Create an incident to start tracking.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {incidents.map((inc) => {
            const sev = SEVERITY_CONFIG[inc.severity] ?? SEVERITY_CONFIG.P3;
            const st = STATUS_CONFIG[inc.status] ?? STATUS_CONFIG.created;
            const slaMs = inc.sla_deadline ? new Date(inc.sla_deadline).getTime() - Date.now() : null;
            const sla = formatSla(slaMs, inc.sla_breached);

            return (
              <button
                key={inc.id}
                type="button"
                onClick={() => onSelect(inc.id)}
                className="relative w-full card-hover rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left transition"
              >
                <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                <div className="flex items-center gap-3">
                  <span
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-bold"
                    style={{ background: sev.bg, color: sev.color }}
                  >
                    {inc.severity}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-sm font-semibold text-[var(--text-primary)]">{inc.title}</h3>
                      <span className="text-[11px] text-[var(--text-tertiary)]">#{inc.id}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-[12px] text-[var(--text-secondary)]">
                      <span
                        className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: st.bg, color: st.color }}
                      >
                        {st.label}
                      </span>
                      {inc.assigned_to && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" /> {inc.assigned_to}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {timeAgo(inc.created_at)}
                      </span>
                      {inc.status !== "resolved" && inc.status !== "closed" && (
                        <span className="flex items-center gap-1" style={{ color: sla.color }}>
                          <AlertTriangle className="h-3 w-3" /> {sla.text}
                        </span>
                      )}
                      {(inc.update_count ?? 0) > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3 w-3" /> {inc.update_count}
                        </span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                </div>
              </button>
            );
          })}
        </div>
      )}

      {showCreate && <CreateIncidentDialog onClose={onCreateClose} />}
    </div>
  );
}

/* ── Detail View ── */

function IncidentDetail({ id, onBack }: { id: number; onBack: () => void }) {
  const { data, loading } = usePollingFetch<DetailData>(`/api/incidents/${id}`, 10000);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const inc = data?.incident;
  const updates = data?.updates ?? [];
  const sla = data?.sla;

  const doAction = useCallback(async (body: Record<string, unknown>) => {
    setActionLoading(true);
    try {
      await fetch(`/api/incidents/${id}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify(body),
      });
    } finally {
      setActionLoading(false);
    }
  }, [id]);

  const addComment = useCallback(async () => {
    if (!comment.trim()) return;
    setSending(true);
    try {
      await fetch(`/api/incidents/${id}/updates`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ content: comment }),
      });
      setComment("");
    } finally {
      setSending(false);
    }
  }, [id, comment]);

  if (loading && !inc) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (!inc) {
    return (
      <div className="py-20 text-center text-[var(--text-secondary)]">
        Incident not found
      </div>
    );
  }

  const sev = SEVERITY_CONFIG[inc.severity] ?? SEVERITY_CONFIG.P3;
  const st = STATUS_CONFIG[inc.status] ?? STATUS_CONFIG.created;
  const slaInfo = sla ? formatSla(sla.remaining_ms, sla.breached) : null;

  const VALID_TRANSITIONS: Record<string, string[]> = {
    created: ["assigned", "investigating"],
    assigned: ["investigating", "resolved"],
    investigating: ["resolved"],
    resolved: ["postmortem", "closed"],
    postmortem: ["closed"],
  };
  const nextStatuses = VALID_TRANSITIONS[inc.status] ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="rounded-lg px-2 py-0.5 text-[11px] font-bold" style={{ background: sev.bg, color: sev.color }}>
              {inc.severity}
            </span>
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: st.bg, color: st.color }}>
              {st.label}
            </span>
            <span className="text-[12px] text-[var(--text-tertiary)]">#{inc.id}</span>
          </div>
          <h1 className="mt-1 text-xl font-extrabold font-display text-[var(--text-primary)]">{inc.title}</h1>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Assigned To</p>
          <p className="mt-1 text-sm font-medium text-[var(--text-primary)]">{inc.assigned_to || "Unassigned"}</p>
        </div>
        <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">SLA</p>
          <p className="mt-1 text-sm font-bold" style={{ color: slaInfo?.color ?? "#555566" }}>
            {slaInfo?.text ?? "No SLA"}
          </p>
        </div>
        <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Created</p>
          <p className="mt-1 text-sm text-[var(--text-primary)]">{timeAgo(inc.created_at)}</p>
        </div>
      </div>

      {/* Description */}
      {inc.description && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">Description</p>
          <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap">{inc.description}</p>
        </div>
      )}

      {/* Actions */}
      {nextStatuses.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-[var(--text-tertiary)]">Transition to:</span>
          {nextStatuses.map((ns) => {
            const nsCfg = STATUS_CONFIG[ns] ?? STATUS_CONFIG.created;
            return (
              <button
                key={ns}
                type="button"
                disabled={actionLoading}
                onClick={() => doAction({ status: ns })}
                className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold transition hover:opacity-80 disabled:opacity-50 btn-press"
                style={{ borderColor: nsCfg.color, color: nsCfg.color, background: nsCfg.bg }}
              >
                {nsCfg.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Timeline */}
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Timeline</p>
        <div className="space-y-3">
          {updates.map((u) => {
            const Icon = UPDATE_ICONS[u.update_type] ?? MessageSquare;
            return (
              <div key={u.id} className="flex gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--bg-surface-2)]">
                  <Icon className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-[12px]">
                    <span className="font-medium text-[var(--text-primary)]">{u.author}</span>
                    <span className="text-[var(--text-tertiary)]">{timeAgo(u.created_at)}</span>
                  </div>
                  {u.content && (
                    <p className="mt-0.5 text-[13px] text-[var(--text-secondary)] whitespace-pre-wrap">{u.content}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add comment */}
      {inc.status !== "closed" && (
        <div className="flex gap-2">
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
            placeholder="Add a comment..."
            className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)]/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={addComment}
            disabled={sending || !comment.trim()}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Create Dialog ── */

function CreateIncidentDialog({ onClose }: { onClose: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("P3");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (!title.trim()) { setError("Title is required"); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/incidents", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || undefined,
          severity,
          assigned_to: assignedTo.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError((data as { error: string }).error || "Failed to create");
        return;
      }
      onClose();
    } catch {
      setError("Failed to create incident");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-black/60" role="button" tabIndex={-1} aria-label="Close" onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} />
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-extrabold font-display text-[var(--text-primary)]">Create Incident</h2>
          <button type="button" onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Brief incident summary"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)]/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What happened? What is the impact?"
              rows={3}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)]/50 focus:outline-none resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Severity</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent)]/50 focus:outline-none"
              >
                {Object.entries(SEVERITY_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">Assign To</label>
              <input
                type="text"
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                placeholder="email or name"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:border-[var(--accent)]/50 focus:outline-none"
              />
            </div>
          </div>

          {error && <p className="text-[12px] text-[var(--danger)]">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-[13px] font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50 btn-press"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create Incident
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
