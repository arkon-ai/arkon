// src/components/mission-control/workflows.tsx
// Phase 5 — Visual Workflow Builder page
"use client";

import { useCallback, useEffect, useState } from "react";
import { CardEntranceWrapper, SkeletonCard, StatCountUp } from "./charts";
import { ShellHeader } from "./dashboard";
import { EmptyState, WorkflowsEmpty } from "./empty-states";
import { SectionDescription } from "./dashboard-clarity";
import {
  Workflow as WorkflowIcon,
  HeartPulse,
  ShieldAlert,
  BarChart3,
  Activity,
  Wallet,
  Bell,
  LayoutGrid,
  ChevronRight,
  Info,
} from "lucide-react";
import { WorkflowBuilder, type WorkflowDefinition } from "./workflow-builder";
import { toast } from "sonner";

// ── Workflow Templates ───────────────────────────────────────────────────────

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  trigger_type: "cron" | "manual";
  trigger_config: { cron_expression?: string } | null;
  definition: WorkflowDefinition;
  customizationHints: string[];
}

const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "health-check",
    name: "Health Check",
    description: "Monitor your servers every 5 minutes. Get alerted if anything goes down.",
    icon: HeartPulse,
    color: "#06d6a0",
    trigger_type: "cron",
    trigger_config: { cron_expression: "*/5 * * * *" },
    definition: {
      nodes: [
        { id: "1", type: "cron-trigger", position: { x: 250, y: 30 }, data: { label: "Every 5 Minutes", cron_expression: "*/5 * * * *" } },
        { id: "2", type: "http-request", position: { x: 250, y: 180 }, data: { label: "Check Infrastructure", method: "GET", url: "{{ARKON_BASE_URL}}/api/infra/status", headers: {}, timeout: 15000 } },
        { id: "3", type: "condition", position: { x: 250, y: 340 }, data: { label: "All Healthy?", field: "status", operator: "eq", value: "200" } },
        { id: "4", type: "notify", position: { x: 80, y: 500 }, data: { label: "Alert: Server Down", channel: "telegram", message: "Server health check failed. Status: {{status}}. Check infrastructure page for details." } },
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
        { id: "e3-4", source: "3", target: "4", sourceHandle: "false" },
      ],
    },
    customizationHints: ["Adjust check frequency in the cron trigger", "Change notification channel (Telegram/Log)", "Customize the alert message"],
  },
  {
    id: "threat-auto-response",
    name: "Threat Auto-Response",
    description: "Automatically pause an agent when a critical threat is detected.",
    icon: ShieldAlert,
    color: "#ef4444",
    trigger_type: "cron",
    trigger_config: { cron_expression: "*/5 * * * *" },
    definition: {
      nodes: [
        { id: "1", type: "cron-trigger", position: { x: 250, y: 30 }, data: { label: "Check Every 5 Min", cron_expression: "*/5 * * * *" } },
        { id: "2", type: "http-request", position: { x: 250, y: 180 }, data: { label: "Get Recent Threats", method: "GET", url: "{{ARKON_BASE_URL}}/api/security/overview?hours=1", headers: {}, timeout: 10000 } },
        { id: "3", type: "condition", position: { x: 250, y: 340 }, data: { label: "Critical Threats?", field: "body", operator: "contains", value: "critical" } },
        { id: "4", type: "http-request", position: { x: 80, y: 500 }, data: { label: "Pause Agent", method: "POST", url: "{{ARKON_BASE_URL}}/api/tools/agents-live/default/pause", headers: {}, timeout: 10000 } },
        { id: "5", type: "notify", position: { x: 80, y: 660 }, data: { label: "Alert: Agent Paused", channel: "telegram", message: "Critical threat detected. Agent auto-paused. Review threats in ThreatGuard." } },
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
        { id: "e3-4", source: "3", target: "4", sourceHandle: "true" },
        { id: "e4-5", source: "4", target: "5" },
      ],
    },
    customizationHints: ["Set the agent ID to pause in the HTTP Request node", "Adjust threat severity threshold in the condition", "Customize the notification message and channel"],
  },
  {
    id: "daily-cost-report",
    name: "Daily Cost Report",
    description: "Get a daily summary of agent spending sent to your preferred channel.",
    icon: BarChart3,
    color: "#3b82f6",
    trigger_type: "cron",
    trigger_config: { cron_expression: "0 6 * * *" },
    definition: {
      nodes: [
        { id: "1", type: "cron-trigger", position: { x: 250, y: 30 }, data: { label: "Daily at 8am SAST", cron_expression: "0 6 * * *" } },
        { id: "2", type: "http-request", position: { x: 250, y: 180 }, data: { label: "Get Cost Summary", method: "GET", url: "{{ARKON_BASE_URL}}/api/costs/overview", headers: {}, timeout: 10000 } },
        { id: "3", type: "notify", position: { x: 250, y: 340 }, data: { label: "Send Cost Report", channel: "telegram", message: "Daily Cost Report\nTotal today: {{body}}\nCheck the Costs page for a full breakdown." } },
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
      ],
    },
    customizationHints: ["Change report time in the cron trigger", "Switch notification channel", "Customize the report message format"],
  },
  {
    id: "client-heartbeat",
    name: "Client Heartbeat",
    description: "Alert you if a client's agent goes silent for more than 30 minutes.",
    icon: Activity,
    color: "#f59e0b",
    trigger_type: "cron",
    trigger_config: { cron_expression: "*/30 * * * *" },
    definition: {
      nodes: [
        { id: "1", type: "cron-trigger", position: { x: 250, y: 30 }, data: { label: "Every 30 Minutes", cron_expression: "*/30 * * * *" } },
        { id: "2", type: "http-request", position: { x: 250, y: 180 }, data: { label: "Check Agent Activity", method: "GET", url: "{{ARKON_BASE_URL}}/api/agents/overview", headers: {}, timeout: 10000 } },
        { id: "3", type: "condition", position: { x: 250, y: 340 }, data: { label: "Any Agents Silent?", field: "body", operator: "contains", value: "offline" } },
        { id: "4", type: "notify", position: { x: 80, y: 500 }, data: { label: "Alert: Agent Silent", channel: "telegram", message: "Agent heartbeat missed. One or more agents haven't reported in 30+ minutes. Check the Agents page." } },
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
        { id: "e3-4", source: "3", target: "4", sourceHandle: "true" },
      ],
    },
    customizationHints: ["Adjust silence threshold in the cron trigger", "Target specific agent IDs in the API call", "Change notification channel and message"],
  },
  {
    id: "budget-alert",
    name: "Budget Alert",
    description: "Notify you when spending hits 80% of your budget limit.",
    icon: Wallet,
    color: "#8b5cf6",
    trigger_type: "cron",
    trigger_config: { cron_expression: "0 * * * *" },
    definition: {
      nodes: [
        { id: "1", type: "cron-trigger", position: { x: 250, y: 30 }, data: { label: "Hourly", cron_expression: "0 * * * *" } },
        { id: "2", type: "http-request", position: { x: 250, y: 180 }, data: { label: "Get Cost Summary", method: "GET", url: "{{ARKON_BASE_URL}}/api/costs/overview", headers: {}, timeout: 10000 } },
        { id: "3", type: "condition", position: { x: 250, y: 340 }, data: { label: "Over 80% Budget?", field: "body", operator: "contains", value: "warning" } },
        { id: "4", type: "notify", position: { x: 80, y: 500 }, data: { label: "Budget Warning", channel: "telegram", message: "Budget alert: Spending has reached 80% of your limit. Review costs and consider pausing non-essential agents." } },
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
        { id: "e3-4", source: "3", target: "4", sourceHandle: "true" },
      ],
    },
    customizationHints: ["Adjust budget threshold in the condition node", "Change check frequency (hourly, every 30 min, etc.)", "Customize the alert message"],
  },
  {
    id: "new-threat-alert",
    name: "New Threat Alert",
    description: "Send immediate notification when any HIGH+ threat is detected.",
    icon: Bell,
    color: "#f97316",
    trigger_type: "cron",
    trigger_config: { cron_expression: "*/5 * * * *" },
    definition: {
      nodes: [
        { id: "1", type: "cron-trigger", position: { x: 250, y: 30 }, data: { label: "Every 5 Minutes", cron_expression: "*/5 * * * *" } },
        { id: "2", type: "http-request", position: { x: 250, y: 180 }, data: { label: "Get Recent Threats", method: "GET", url: "{{ARKON_BASE_URL}}/api/security/overview?hours=1", headers: {}, timeout: 10000 } },
        { id: "3", type: "condition", position: { x: 250, y: 340 }, data: { label: "High+ Threats?", field: "body", operator: "contains", value: "high" } },
        { id: "4", type: "notify", position: { x: 80, y: 500 }, data: { label: "Threat Alert", channel: "telegram", message: "New HIGH+ severity threat detected in the last hour. Review immediately in ThreatGuard." } },
      ],
      edges: [
        { id: "e1-2", source: "1", target: "2" },
        { id: "e2-3", source: "2", target: "3" },
        { id: "e3-4", source: "3", target: "4", sourceHandle: "true" },
      ],
    },
    customizationHints: ["Change severity threshold in the condition", "Adjust polling frequency", "Route alerts to different channels per severity"],
  },
];

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
  const [templateStep, setTemplateStep] = useState<"gallery" | "customize">("gallery");
  const [selectedTemplate, setSelectedTemplate] = useState<WorkflowTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<WorkflowTemplate | null>(null);

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
    if (!newName.trim() || !newDesc.trim()) return;
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

  // Install from template
  const handleInstallTemplate = async (asDraft: boolean) => {
    if (!selectedTemplate || !newName.trim() || !newDesc.trim()) return;
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "content-type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim(),
          definition: selectedTemplate.definition,
          status: asDraft ? "draft" : "active",
          trigger_type: selectedTemplate.trigger_type,
          trigger_config: selectedTemplate.trigger_config,
        }),
      });
      if (!res.ok) throw new Error("Failed to create workflow");
      const data = (await res.json()) as { workflow: Workflow };
      toast.success(`Workflow "${data.workflow.name}" created from template`);
      closeTemplateModal();
      setSelectedWorkflow(data.workflow);
      setView("editor");
      fetchWorkflows();
    } catch {
      toast.error("Failed to create workflow from template");
    }
  };

  const closeTemplateModal = () => {
    setShowNewModal(false);
    setNewName("");
    setNewDesc("");
    setTemplateStep("gallery");
    setSelectedTemplate(null);
    setPreviewTemplate(null);
  };

  const selectTemplate = (tmpl: WorkflowTemplate) => {
    setSelectedTemplate(tmpl);
    setNewName(tmpl.name);
    setNewDesc(tmpl.description);
    setTemplateStep("customize");
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

        <SectionDescription id="workflows">
          Workflows let you automate responses to events in your AI infrastructure.
          For example: automatically pause an agent when a critical threat is detected,
          send a daily cost report, or check server health every 5 minutes.
        </SectionDescription>

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
          <WorkflowsEmpty />
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
                      {wf.description ? (
                        <p className="text-sm text-slate-400 line-clamp-1 mb-2">{wf.description}</p>
                      ) : (
                        <p className="text-sm text-amber-400/50 italic mb-2">No description</p>
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

        {/* Template Gallery / New Workflow Modal */}
        {showNewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            {templateStep === "gallery" ? (
              /* ── Template Gallery ── */
              <div className="w-full max-w-3xl max-h-[85vh] rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] shadow-2xl flex flex-col">
                <div className="flex items-center justify-between p-6 pb-4 border-b border-[#1a2a4a]">
                  <div>
                    <h3 className="text-lg font-bold text-white">New Workflow</h3>
                    <p className="text-sm text-slate-400 mt-1">Start from a template or build from scratch</p>
                  </div>
                  <button onClick={closeTemplateModal} className="text-slate-400 hover:text-white text-xl leading-none">&times;</button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 pt-4 space-y-3">
                  {WORKFLOW_TEMPLATES.map((tmpl) => {
                    const Icon = tmpl.icon;
                    return (
                      <div
                        key={tmpl.id}
                        className="group rounded-xl border border-[#1a2a4a] bg-[#0a0a14] p-4 hover:border-[#2a3a5a] transition cursor-pointer"
                        onClick={() => selectTemplate(tmpl)}
                      >
                        <div className="flex items-start gap-4">
                          <div
                            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg"
                            style={{ background: `${tmpl.color}15`, border: `1px solid ${tmpl.color}30` }}
                          >
                            <Icon className="w-5 h-5" style={{ color: tmpl.color }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold text-white group-hover:text-[#06d6a0] transition">{tmpl.name}</span>
                              <span
                                className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                                style={{ background: `${tmpl.color}15`, color: tmpl.color }}
                              >
                                {tmpl.trigger_type}
                              </span>
                            </div>
                            <p className="text-sm text-slate-400">{tmpl.description}</p>
                            <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                              <span>{tmpl.definition.nodes.length} nodes</span>
                              {tmpl.trigger_config?.cron_expression && (
                                <span className="font-mono text-cyan-400/70">{tmpl.trigger_config.cron_expression}</span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-2">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewTemplate(previewTemplate?.id === tmpl.id ? null : tmpl);
                              }}
                              className="rounded-lg border border-[#1a2a4a] px-3 py-1.5 text-xs text-slate-400 hover:text-white hover:border-[#2a3a5a] transition"
                            >
                              Preview
                            </button>
                            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-[#06d6a0] transition" />
                          </div>
                        </div>

                        {/* Inline Preview */}
                        {previewTemplate?.id === tmpl.id && (
                          <div className="mt-3 rounded-lg border border-[#1a2a4a] overflow-hidden" style={{ height: 220 }}>
                            <WorkflowBuilder definition={tmpl.definition} onChange={() => {}} readOnly />
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Blank Canvas Option */}
                  <div
                    className="group rounded-xl border border-dashed border-[#1a2a4a] bg-[#0a0a14] p-4 hover:border-[#2a3a5a] transition cursor-pointer"
                    onClick={() => {
                      setSelectedTemplate(null);
                      setNewName("");
                      setNewDesc("");
                      setTemplateStep("customize");
                    }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg border border-[#1a2a4a] bg-[#0d0d1a]">
                        <LayoutGrid className="w-5 h-5 text-slate-500" />
                      </div>
                      <div className="flex-1">
                        <span className="text-sm font-semibold text-slate-300 group-hover:text-white transition">Blank Canvas</span>
                        <p className="text-sm text-slate-500">Start from scratch with an empty workflow</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-white transition" />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              /* ── Customize / Create Step ── */
              <div className="w-full max-w-lg rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] p-6 shadow-2xl">
                <div className="flex items-center gap-3 mb-5">
                  <button
                    onClick={() => { setTemplateStep("gallery"); setSelectedTemplate(null); setNewName(""); setNewDesc(""); }}
                    className="text-slate-400 hover:text-white transition text-sm"
                  >
                    &larr; Back
                  </button>
                  <h3 className="text-lg font-bold text-white">
                    {selectedTemplate ? `Install: ${selectedTemplate.name}` : "New Workflow"}
                  </h3>
                </div>

                {selectedTemplate && (
                  <div className="mb-4 rounded-lg border border-[#1a2a4a] bg-[#0a0a14] p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Info className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-[11px] uppercase tracking-wider text-slate-500 font-medium">Customize before activating</span>
                    </div>
                    <ul className="space-y-1">
                      {selectedTemplate.customizationHints.map((hint, i) => (
                        <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                          <span className="text-slate-600 mt-0.5">&#8226;</span>
                          <span>{hint}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                      Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="e.g. Daily Health Check"
                      className="w-full rounded-lg border border-[#1a2a4a] bg-[#0a0a14] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#06d6a0] focus:outline-none"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] uppercase tracking-wider text-slate-500 mb-1">
                      Description <span className="text-red-400">*</span>
                    </label>
                    <textarea
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      rows={2}
                      placeholder="In plain English, what does this workflow do?"
                      className="w-full rounded-lg border border-[#1a2a4a] bg-[#0a0a14] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-[#06d6a0] focus:outline-none resize-none"
                    />
                    {!newDesc.trim() && newName.trim() && (
                      <p className="text-[11px] text-amber-400/70 mt-1">Description is required — tell users what this workflow does</p>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-5">
                  <button
                    onClick={closeTemplateModal}
                    className="rounded-lg px-4 py-2 text-sm text-slate-400 hover:text-white transition"
                  >
                    Cancel
                  </button>
                  {selectedTemplate ? (
                    <>
                      <button
                        onClick={() => handleInstallTemplate(true)}
                        disabled={!newName.trim() || !newDesc.trim()}
                        className="rounded-lg border border-[#1a2a4a] px-4 py-2 text-sm font-medium text-slate-300 hover:text-white hover:border-[#2a3a5a] transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save as Draft
                      </button>
                      <button
                        onClick={() => handleInstallTemplate(false)}
                        disabled={!newName.trim() || !newDesc.trim()}
                        className="rounded-lg bg-[#06d6a0] px-4 py-2 text-sm font-semibold text-[#0a0a14] hover:bg-[#06d6a0]/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Activate Now
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleCreate}
                      disabled={!newName.trim() || !newDesc.trim()}
                      className="rounded-lg bg-[#06d6a0] px-4 py-2 text-sm font-semibold text-[#0a0a14] hover:bg-[#06d6a0]/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Create
                    </button>
                  )}
                </div>
              </div>
            )}
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
              {selectedWorkflow.description ? (
                <p className="text-xs text-slate-400">{selectedWorkflow.description}</p>
              ) : (
                <button
                  onClick={() => {
                    const desc = prompt("What does this workflow do?");
                    if (desc?.trim()) handleUpdateMeta({ description: desc.trim() } as Partial<Workflow>);
                  }}
                  className="text-xs text-amber-400/70 hover:text-amber-400 transition"
                >
                  + Add description (required)
                </button>
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
          <EmptyState
            icon={WorkflowIcon}
            title="No runs yet"
            description="Execute this workflow to see results here."
            compact
          />
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
