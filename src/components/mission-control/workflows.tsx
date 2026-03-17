// src/components/mission-control/workflows.tsx
// Phase 5 — Visual Workflow Builder page
"use client";

import { useCallback, useEffect, useState } from "react";
import { CardEntranceWrapper, SkeletonCard, StatCountUp } from "./charts";
import { ShellHeader } from "./dashboard";
import { WorkflowBuilder, type WorkflowDefinition } from "./workflow-builder";
import { toast } from "sonner";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Workflow {
  id: number;
  name: string;
  description: string | null;
  definition: WorkflowDefinition;
  status: string;
  trigger_type: string;
  trigger_config: { cron_expression?: string } | null;
  created_by: string | null;
  tenant_id: string;
  last_run_at: string | null;
  run_count: number;
  total_runs: number;
  failed_runs: number;
  created_at: string;
  updated_at: string;
}

interface WorkflowRun {
  id: number;
  workflow_id: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  step_results: StepResult[];
  error: string | null;
  triggered_by: string;
}

interface StepResult {
  nodeId: string;
  nodeType: string;
  label: string;
  status: "success" | "failed" | "skipped";
  output: unknown;
  error?: string;
  durationMs: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
  active: { bg: "rgba(6,214,160,0.15)", text: "#06d6a0" },
  paused: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
  archived: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
  running: { bg: "rgba(59,130,246,0.15)", text: "#3b82f6" },
  completed: { bg: "rgba(6,214,160,0.15)", text: "#06d6a0" },
  failed: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
  success: { bg: "rgba(6,214,160,0.15)", text: "#06d6a0" },
  skipped: { bg: "rgba(100,116,139,0.1)", text: "#64748b" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status] ?? STATUS_COLORS.draft;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
      style={{ background: s.bg, color: s.text }}
    >
      {status}
    </span>
  );
}

// ── Workflows Screen ──────────────────────────────────────────────────────────

type View = "list" | "editor" | "runs";

export function WorkflowsScreen() {
  const [view, setView] = useState<View>("list");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  // Fetch workflows
  const fetchWorkflows = useCallback(async () => {
    try {
      const res = await fetch(`/api/workflows?status=${statusFilter}`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch workflows");
      const data = (await res.json()) as { workflows: Workflow[] };
      setWorkflows(data.workflows);
    } catch (err) {
      console.error("Failed to fetch workflows:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  // Fetch runs for selected workflow
  const fetchRuns = useCallback(async (workflowId: number) => {
    try {
      const res = await fetch(`/api/workflows/${workflowId}/runs?limit=20`, {
        headers: getAuthHeaders(),
        cache: "no-store",
      });
      if (!res.ok) throw new Error("Failed to fetch runs");
      const data = (await res.json()) as { runs: WorkflowRun[] };
      setRuns(data.runs);
    } catch {
      setRuns([]);
    }
  }, []);

  // Create workflow
  const handleCreate = async () => {
    if (!newName.trim()) return;
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || null,
          definition: {
            nodes: [{ id: "1", type: "manual-trigger", position: { x: 250, y: 50 }, data: { label: "Manual Trigger" } }],
            edges: [],
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const data = (await res.json()) as { workflow: Workflow };
      toast.success(`Workflow "${data.workflow.name}" created`);
      setShowNewModal(false);
      setNewName("");
      setNewDesc("");
      setSelectedWorkflow(data.workflow);
      setView("editor");
      fetchWorkflows();
    } catch {
      toast.error("Failed to create workflow");
    }
  };

  // Save workflow definition
  const handleSave = async (def: WorkflowDefinition) => {
    if (!selectedWorkflow) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ definition: def }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = (await res.json()) as { workflow: Workflow };
      setSelectedWorkflow(data.workflow);
      toast.success("Workflow saved");
    } catch {
      toast.error("Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  // Update workflow metadata
  const handleUpdateMeta = async (updates: Partial<Workflow>) => {
    if (!selectedWorkflow) return;
    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error("Failed to update");
      const data = (await res.json()) as { workflow: Workflow };
      setSelectedWorkflow(data.workflow);
      fetchWorkflows();
      toast.success("Workflow updated");
    } catch {
      toast.error("Failed to update workflow");
    }
  };

  // Execute workflow
  const handleExecute = async () => {
    if (!selectedWorkflow) return;
    setExecuting(true);
    try {
      const res = await fetch(`/api/workflows/${selectedWorkflow.id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
      });
      if (!res.ok) throw new Error("Execution failed");
      const data = (await res.json()) as { run_id: number; status: string; steps: StepResult[]; error: string | null };
      if (data.status === "completed") {
        toast.success(`Run #${data.run_id} completed (${data.steps.length} steps)`);
      } else {
        toast.error(`Run #${data.run_id} failed: ${data.error}`);
      }
      fetchRuns(selectedWorkflow.id);
      fetchWorkflows();
    } catch {
      toast.error("Failed to execute workflow");
    } finally {
      setExecuting(false);
    }
  };

  // Delete workflow
  const handleDelete = async (wf: Workflow) => {
    if (!confirm(`Delete "${wf.name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/workflows/${wf.id}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(`Deleted "${wf.name}"`);
      if (selectedWorkflow?.id === wf.id) {
        setSelectedWorkflow(null);
        setView("list");
      }
      fetchWorkflows();
    } catch {
      toast.error("Failed to delete workflow");
    }
  };

  // ── List View ─────────────────────────────────────────────────────────────

  if (view === "list") {
    return (
      <div>
        <ShellHeader
          title="Workflows"
          subtitle="Visual workflow builder for automating multi-step operations"
          eyebrow="Operate"
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {["all", "draft", "active", "paused", "archived"].map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  statusFilter === s
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            className="rounded-lg bg-[#06d6a0] px-4 py-2 text-sm font-semibold text-[#0a0a14] hover:bg-[#06d6a0]/90 transition active:scale-95"
          >
            + New Workflow
          </button>
        </div>

        {loading ? (
          <div className="space-y-3">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : workflows.length === 0 ? (
          <div className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] p-8 text-center">
            <p className="text-lg text-slate-400 mb-2">No workflows yet</p>
            <p className="text-sm text-slate-500">Create your first workflow to automate multi-step operations.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((wf, i) => (
              <CardEntranceWrapper key={wf.id} index={i}>
                <div className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] p-4 hover:border-[#2a3a5a] transition">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <button
                          onClick={() => { setSelectedWorkflow(wf); setView("editor"); }}
                          className="text-base font-semibold text-white hover:text-[#06d6a0] transition truncate"
                        >
                          {wf.name}
                        </button>
                        <StatusBadge status={wf.status} />
                      </div>
                      {wf.description && (
                        <p className="text-sm text-slate-400 line-clamp-1 mb-2">{wf.description}</p>
                      )}
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                        <span>
                          Trigger: {wf.trigger_type}
                          {wf.trigger_type === "cron" && wf.trigger_config?.cron_expression && (
                            <span className="ml-1 font-mono text-cyan-400">({wf.trigger_config.cron_expression})</span>
                          )}
                        </span>
                        <span>Runs: <StatCountUp value={wf.run_count} /></span>
                        {wf.failed_runs > 0 && (
                          <span className="text-red-400">Failed: {wf.failed_runs}</span>
                        )}
                        {wf.last_run_at && <span>Last run: {timeAgo(wf.last_run_at)}</span>}
                        <span>Created: {timeAgo(wf.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => { setSelectedWorkflow(wf); fetchRuns(wf.id); setView("runs"); }}
                        className="rounded-lg border border-[#1a2a4a] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-[#2a3a5a] transition"
                      >
                        Runs
                      </button>
                      <button
                        onClick={() => { setSelectedWorkflow(wf); setView("editor"); }}
                        className="rounded-lg border border-[#1a2a4a] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-[#2a3a5a] transition"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(wf)}
                        className="rounded-lg border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </CardEntranceWrapper>
            ))}
          </div>
        )}

        {/* New Workflow Modal */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-4">New Workflow</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Daily Health Check"
                    className="w-full rounded-lg border border-[#1a2a4a] bg-[#0a0a14] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#06d6a0] focus:outline-none"
                    autoFocus
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                  />
                </div>
                <div>
                  <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">Description (optional)</label>
                  <textarea
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    rows={2}
                    placeholder="What does this workflow do?"
                    className="w-full rounded-lg border border-[#1a2a4a] bg-[#0a0a14] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#06d6a0] focus:outline-none resize-none"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-5">
                <button
                  onClick={() => { setShowNewModal(false); setNewName(""); setNewDesc(""); }}
                  className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="rounded-lg bg-[#06d6a0] px-4 py-2 text-sm font-semibold text-[#0a0a14] hover:bg-[#06d6a0]/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Editor View ───────────────────────────────────────────────────────────

  if (view === "editor" && selectedWorkflow) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setView("list"); setSelectedWorkflow(null); }}
              className="text-slate-400 hover:text-white transition text-sm"
            >
              &larr; Back
            </button>
            <div>
              <h2 className="text-lg font-bold text-white">{selectedWorkflow.name}</h2>
              {selectedWorkflow.description && (
                <p className="text-xs text-slate-400">{selectedWorkflow.description}</p>
              )}
            </div>
            <StatusBadge status={selectedWorkflow.status} />
          </div>
          <div className="flex gap-2">
            {selectedWorkflow.status === "draft" && (
              <button
                onClick={() => handleUpdateMeta({ status: "active" } as Partial<Workflow>)}
                className="rounded-lg border border-[#06d6a0]/30 bg-[#06d6a0]/10 px-3 py-1.5 text-xs font-medium text-[#06d6a0] hover:bg-[#06d6a0]/20 transition"
              >
                Activate
              </button>
            )}
            {selectedWorkflow.status === "active" && (
              <button
                onClick={() => handleUpdateMeta({ status: "paused" } as Partial<Workflow>)}
                className="rounded-lg border border-[#f59e0b]/30 bg-[#f59e0b]/10 px-3 py-1.5 text-xs font-medium text-[#f59e0b] hover:bg-[#f59e0b]/20 transition"
              >
                Pause
              </button>
            )}
            {selectedWorkflow.status === "paused" && (
              <button
                onClick={() => handleUpdateMeta({ status: "active" } as Partial<Workflow>)}
                className="rounded-lg border border-[#06d6a0]/30 bg-[#06d6a0]/10 px-3 py-1.5 text-xs font-medium text-[#06d6a0] hover:bg-[#06d6a0]/20 transition"
              >
                Resume
              </button>
            )}
            <button
              onClick={handleExecute}
              disabled={executing}
              className="rounded-lg bg-[#3b82f6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3b82f6]/90 transition disabled:opacity-50"
            >
              {executing ? "Running..." : "Run Now"}
            </button>
            <button
              onClick={() => { fetchRuns(selectedWorkflow.id); setView("runs"); }}
              className="rounded-lg border border-[#1a2a4a] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-[#2a3a5a] transition"
            >
              View Runs ({selectedWorkflow.run_count})
            </button>
          </div>
        </div>

        {/* Cron Trigger Config Bar */}
        {selectedWorkflow.trigger_type === "cron" && (
          <CronConfigBar
            workflow={selectedWorkflow}
            onUpdate={(updates) => handleUpdateMeta(updates as Partial<Workflow>)}
          />
        )}

        {/* Trigger Type Toggle */}
        <div className="mb-3 flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-slate-500">Trigger:</span>
          {["manual", "cron"].map((t) => (
            <button
              key={t}
              onClick={() => {
                const updates: Record<string, unknown> = { trigger_type: t };
                if (t === "cron" && !selectedWorkflow.trigger_config?.cron_expression) {
                  updates.trigger_config = { cron_expression: "*/5 * * * *" };
                }
                handleUpdateMeta(updates as Partial<Workflow>);
              }}
              className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
                selectedWorkflow.trigger_type === t
                  ? t === "cron" ? "bg-cyan-500/15 text-cyan-400 border border-cyan-500/30" : "bg-white/10 text-white border border-white/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white border border-transparent"
              }`}
            >
              {t === "cron" ? "\u23F0 Cron" : "\u25B6 Manual"}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[#1a2a4a] overflow-hidden" style={{ height: selectedWorkflow.trigger_type === "cron" ? "calc(100vh - 320px)" : "calc(100vh - 260px)" }}>
          <WorkflowBuilder
            definition={selectedWorkflow.definition}
            onChange={(def) => handleSave(def)}
          />
        </div>

        {saving && (
          <div className="fixed bottom-20 right-6 z-50 rounded-lg bg-[#0d0d1a] border border-[#1a2a4a] px-4 py-2 text-xs text-slate-400 shadow-lg">
            Saving...
          </div>
        )}
      </div>
    );
  }

  // ── Runs View ─────────────────────────────────────────────────────────────

  if (view === "runs" && selectedWorkflow) {
    return (
      <div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("list")}
              className="text-slate-400 hover:text-white transition text-sm"
            >
              &larr; Back
            </button>
            <div>
              <h2 className="text-lg font-bold text-white">{selectedWorkflow.name} — Run History</h2>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setView("editor")}
              className="rounded-lg border border-[#1a2a4a] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-[#2a3a5a] transition"
            >
              Edit Workflow
            </button>
            <button
              onClick={handleExecute}
              disabled={executing}
              className="rounded-lg bg-[#3b82f6] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#3b82f6]/90 transition disabled:opacity-50"
            >
              {executing ? "Running..." : "Run Now"}
            </button>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] p-8 text-center">
            <p className="text-slate-400 mb-1">No runs yet</p>
            <p className="text-sm text-slate-500">Execute this workflow to see results here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {runs.map((run, i) => (
              <CardEntranceWrapper key={run.id} index={i}>
                <RunCard run={run} />
              </CardEntranceWrapper>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Fallback
  return null;
}

// ── Cron Config Bar ──────────────────────────────────────────────────────────

const CRON_PRESETS = [
  { expr: "*/5 * * * *", label: "Every 5 min" },
  { expr: "*/15 * * * *", label: "Every 15 min" },
  { expr: "*/30 * * * *", label: "Every 30 min" },
  { expr: "0 * * * *", label: "Hourly" },
  { expr: "0 6 * * *", label: "Daily 8am SAST" },
  { expr: "0 6 * * 1-5", label: "Weekdays 8am SAST" },
];

function getNextCronRunClient(expression: string): string | null {
  // Lightweight client-side next-run calculator
  // Same logic as server-side getNextCronRun
  try {
    const parts = expression.trim().split(/\s+/);
    if (parts.length !== 5) return null;

    function parseField(field: string, min: number, max: number): Set<number> {
      const values = new Set<number>();
      for (const part of field.split(",")) {
        const t = part.trim();
        if (t === "*") { for (let i = min; i <= max; i++) values.add(i); continue; }
        const stepMatch = t.match(/^(\*|(\d+)-(\d+))\/(\d+)$/);
        if (stepMatch) {
          const step = parseInt(stepMatch[4], 10);
          let s = min, e = max;
          if (stepMatch[2] !== undefined) { s = parseInt(stepMatch[2], 10); e = parseInt(stepMatch[3], 10); }
          for (let i = s; i <= e; i += step) values.add(i);
          continue;
        }
        const rangeMatch = t.match(/^(\d+)-(\d+)$/);
        if (rangeMatch) { for (let i = parseInt(rangeMatch[1], 10); i <= parseInt(rangeMatch[2], 10); i++) values.add(i); continue; }
        const num = parseInt(t, 10);
        if (!isNaN(num)) values.add(num);
      }
      return values;
    }

    const minutes = parseField(parts[0], 0, 59);
    const hours = parseField(parts[1], 0, 23);
    const daysOfMonth = parseField(parts[2], 1, 31);
    const months = parseField(parts[3], 1, 12);
    const daysOfWeek = parseField(parts[4], 0, 6);

    const check = new Date();
    check.setSeconds(0, 0);
    check.setMinutes(check.getMinutes() + 1);

    for (let i = 0; i < 2880; i++) { // 48h
      if (
        minutes.has(check.getMinutes()) &&
        hours.has(check.getHours()) &&
        daysOfMonth.has(check.getDate()) &&
        months.has(check.getMonth() + 1) &&
        daysOfWeek.has(check.getDay())
      ) {
        return check.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
      }
      check.setMinutes(check.getMinutes() + 1);
    }
    return null;
  } catch {
    return null;
  }
}

function CronConfigBar({ workflow, onUpdate }: { workflow: Workflow; onUpdate: (updates: Record<string, unknown>) => void }) {
  const cronExpr = workflow.trigger_config?.cron_expression ?? "*/5 * * * *";
  const [editing, setEditing] = useState(false);
  const [expr, setExpr] = useState(cronExpr);
  const nextRun = getNextCronRunClient(cronExpr);

  const saveCron = () => {
    if (expr.trim().split(/\s+/).length === 5) {
      onUpdate({ trigger_config: { cron_expression: expr.trim() } });
      setEditing(false);
    }
  };

  return (
    <div className="mb-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-cyan-400 text-sm">{"\u23F0"}</span>
          {editing ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={expr}
                onChange={(e) => setExpr(e.target.value)}
                className="rounded border border-cyan-500/30 bg-[#0a0a14] px-2 py-1 text-sm font-mono text-white w-40 focus:border-cyan-400 focus:outline-none"
                onKeyDown={(e) => { if (e.key === "Enter") saveCron(); if (e.key === "Escape") { setExpr(cronExpr); setEditing(false); } }}
                autoFocus
              />
              <button onClick={saveCron} className="text-xs text-cyan-400 hover:text-white transition">Save</button>
              <button onClick={() => { setExpr(cronExpr); setEditing(false); }} className="text-xs text-slate-500 hover:text-white transition">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setEditing(true)} className="font-mono text-sm text-white hover:text-cyan-400 transition">
              {cronExpr}
            </button>
          )}
          {!editing && (
            <div className="flex gap-1">
              {CRON_PRESETS.slice(0, 4).map((p) => (
                <button
                  key={p.expr}
                  onClick={() => onUpdate({ trigger_config: { cron_expression: p.expr } })}
                  className={`rounded px-2 py-0.5 text-[10px] transition ${
                    cronExpr === p.expr ? "bg-cyan-500/20 text-cyan-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="text-[11px] text-slate-500">
          {nextRun ? (
            <span>Next run: <span className="text-cyan-400">{nextRun} SAST</span></span>
          ) : (
            <span className="text-amber-400">Invalid expression</span>
          )}
          {workflow.status === "active" && <span className="ml-2 text-green-400">Scheduled</span>}
          {workflow.status !== "active" && <span className="ml-2 text-slate-600">Activate to enable</span>}
        </div>
      </div>
    </div>
  );
}

// ── Run Card (with expandable step results) ─────────────────────────────────

function RunCard({ run }: { run: WorkflowRun }) {
  const [expanded, setExpanded] = useState(false);
  const steps = (run.step_results ?? []) as StepResult[];
  const duration =
    run.completed_at && run.started_at
      ? new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
      : null;

  return (
    <div className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-white/[0.02] transition"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-mono text-slate-500">#{run.id}</span>
            <StatusBadge status={run.status} />
            <span className="text-xs text-slate-500">{steps.length} steps</span>
            {duration !== null && (
              <span className="text-xs text-slate-500">{duration}ms</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">{timeAgo(run.started_at)}</span>
            <span className="text-slate-500 text-xs">{expanded ? "\u25B2" : "\u25BC"}</span>
          </div>
        </div>
        {run.error && (
          <p className="mt-2 text-xs text-red-400 line-clamp-1">{run.error}</p>
        )}
      </button>

      {expanded && steps.length > 0 && (
        <div className="border-t border-[#1a2a4a] p-4 space-y-2">
          {steps.map((step, i) => (
            <div
              key={`${step.nodeId}-${i}`}
              className="flex items-start gap-3 rounded-lg p-2"
              style={{
                background:
                  step.status === "success"
                    ? "rgba(6,214,160,0.05)"
                    : step.status === "failed"
                    ? "rgba(239,68,68,0.05)"
                    : "rgba(100,116,139,0.05)",
              }}
            >
              <div className="shrink-0 mt-0.5">
                <StatusBadge status={step.status} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{step.label}</span>
                  <span className="text-[10px] text-slate-500 font-mono">{step.nodeType}</span>
                  {step.durationMs > 0 && (
                    <span className="text-[10px] text-slate-500">{step.durationMs}ms</span>
                  )}
                </div>
                {step.error && (
                  <p className="text-xs text-red-400 mt-1">{step.error}</p>
                )}
                {step.output != null && (
                  <pre className="text-[11px] text-slate-400 mt-1 overflow-x-auto max-h-24 font-mono">
                    {typeof step.output === "string"
                      ? step.output
                      : JSON.stringify(step.output as Record<string, unknown>, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
