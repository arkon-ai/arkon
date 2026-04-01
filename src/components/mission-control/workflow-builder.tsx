// src/components/mission-control/workflow-builder.tsx
// Visual workflow canvas using React Flow — Phase 5 v1
"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  MiniMap,
  Controls,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  Handle,
  Position,
  MarkerType,
  Panel,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WorkflowDefinition {
  nodes: Array<{
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
  }>;
}

interface NodeConfig {
  label: string;
  // manual-trigger
  // cron-trigger
  cron_expression?: string;
  // http-request
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
  // condition
  field?: string;
  operator?: string;
  value?: string;
  // notify
  channel?: string;
  message?: string;
}

// ── Node type colors ──────────────────────────────────────────────────────────

const NODE_STYLES: Record<string, { bg: string; border: string; icon: string; accent: string }> = {
  "manual-trigger": { bg: "#1a1a2e", border: "#00D47E", icon: "\u25B6", accent: "#00D47E" },
  "cron-trigger":   { bg: "#1a1a2e", border: "#06b6d4", icon: "\u23F0", accent: "#06b6d4" },
  "http-request":   { bg: "#1a1a2e", border: "#3b82f6", icon: "\u21C5", accent: "#3b82f6" },
  "condition":      { bg: "#1a1a2e", border: "#f59e0b", icon: "\u2747", accent: "#f59e0b" },
  "notify":         { bg: "#1a1a2e", border: "#00D47E", icon: "\u2709", accent: "#00D47E" },
};

// ── Custom Node Components ────────────────────────────────────────────────────

function ManualTriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeConfig;
  const s = NODE_STYLES["manual-trigger"];
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-lg min-w-[180px] transition-shadow"
      style={{
        background: s.bg,
        border: `2px solid ${selected ? "#fff" : s.border}`,
        boxShadow: selected ? `0 0 20px ${s.border}40` : "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: s.accent }}>{s.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.accent }}>Trigger</span>
      </div>
      <div className="text-sm text-white font-medium">{d.label || "Manual Trigger"}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--accent)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
    </div>
  );
}

function CronTriggerNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeConfig;
  const s = NODE_STYLES["cron-trigger"];
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-lg min-w-[180px] transition-shadow"
      style={{
        background: s.bg,
        border: `2px solid ${selected ? "#fff" : s.border}`,
        boxShadow: selected ? `0 0 20px ${s.border}40` : "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: s.accent }}>{s.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.accent }}>Cron Trigger</span>
      </div>
      <div className="text-sm text-white font-medium">{d.label || "Cron Trigger"}</div>
      {d.cron_expression && (
        <div className="text-[11px] text-[var(--text-secondary)] mt-1 font-mono">{d.cron_expression}</div>
      )}
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--info)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
    </div>
  );
}

function HttpRequestNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeConfig;
  const s = NODE_STYLES["http-request"];
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-lg min-w-[200px] transition-shadow"
      style={{
        background: s.bg,
        border: `2px solid ${selected ? "#fff" : s.border}`,
        boxShadow: selected ? `0 0 20px ${s.border}40` : "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--info)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: s.accent }}>{s.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.accent }}>HTTP</span>
        {d.method && (
          <span className="ml-auto text-[10px] font-mono px-1.5 py-0.5 rounded" style={{ background: `${s.accent}20`, color: s.accent }}>
            {d.method}
          </span>
        )}
      </div>
      <div className="text-sm text-white font-medium">{d.label || "HTTP Request"}</div>
      {d.url && <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate max-w-[220px]">{d.url}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--info)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
    </div>
  );
}

function ConditionNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeConfig;
  const s = NODE_STYLES["condition"];
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-lg min-w-[200px] transition-shadow"
      style={{
        background: s.bg,
        border: `2px solid ${selected ? "#fff" : s.border}`,
        boxShadow: selected ? `0 0 20px ${s.border}40` : "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--warning)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: s.accent }}>{s.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.accent }}>Condition</span>
      </div>
      <div className="text-sm text-white font-medium">{d.label || "If / Else"}</div>
      {d.field && (
        <div className="text-[11px] text-[var(--text-secondary)] mt-1">
          {d.field} {d.operator} {d.value}
        </div>
      )}
      <div className="flex justify-between mt-2 text-[10px]">
        <span className="text-green-400">True</span>
        <span className="text-red-400">False</span>
      </div>
      <Handle type="source" position={Position.Bottom} id="true" className="!bg-green-400 !w-3 !h-3 !border-2 !border-[var(--border)]" style={{ left: "30%" }} />
      <Handle type="source" position={Position.Bottom} id="false" className="!bg-red-400 !w-3 !h-3 !border-2 !border-[var(--border)]" style={{ left: "70%" }} />
    </div>
  );
}

function NotifyNode({ data, selected }: NodeProps) {
  const d = data as unknown as NodeConfig;
  const s = NODE_STYLES["notify"];
  return (
    <div
      className="rounded-xl px-4 py-3 shadow-lg min-w-[180px] transition-shadow"
      style={{
        background: s.bg,
        border: `2px solid ${selected ? "#fff" : s.border}`,
        boxShadow: selected ? `0 0 20px ${s.border}40` : "0 4px 12px rgba(0,0,0,0.3)",
      }}
    >
      <Handle type="target" position={Position.Top} className="!bg-[var(--accent)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: s.accent }}>{s.icon}</span>
        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: s.accent }}>Notify</span>
        {d.channel && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded" style={{ background: `${s.accent}20`, color: s.accent }}>
            {d.channel}
          </span>
        )}
      </div>
      <div className="text-sm text-white font-medium">{d.label || "Notify"}</div>
      {d.message && <div className="text-[11px] text-[var(--text-secondary)] mt-1 truncate max-w-[200px]">{d.message}</div>}
      <Handle type="source" position={Position.Bottom} className="!bg-[var(--accent)] !w-3 !h-3 !border-2 !border-[var(--border)]" />
    </div>
  );
}

// ── Node Config Panel ─────────────────────────────────────────────────────────

function NodeConfigPanel({
  node,
  onUpdate,
  onClose,
}: {
  node: Node;
  onUpdate: (id: string, data: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const d = node.data as unknown as NodeConfig;
  const nodeType = node.type ?? "unknown";

  const updateField = (field: string, value: unknown) => {
    onUpdate(node.id, { ...node.data, [field]: value });
  };

  const NODE_HELP: Record<string, string> = {
    "manual-trigger": "This node starts the workflow when you click Run Now. No configuration needed.",
    "cron-trigger": "Runs the workflow on a schedule using a cron expression. Common patterns: */5 for every 5 minutes, 0 6 for daily at 8am SAST.",
    "http-request": "Makes an HTTP request to any URL. Use template variables like {{status}} and {{body}} to pass data from previous steps.",
    "condition": "Evaluates a condition on data from previous steps. Routes the workflow down the True or False branch based on the result.",
    "notify": "Sends a notification message. Use template variables like {{status}} and {{body}} to include data from previous steps.",
  };

  return (
    <div className="absolute right-4 top-4 z-50 w-80 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 shadow-2xl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white">Configure Node</h3>
        <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] text-lg leading-none">&times;</button>
      </div>
      {NODE_HELP[nodeType] && (
        <div className="mb-4 rounded-lg bg-[var(--bg-primary)] border border-[var(--border)] px-3 py-2">
          <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">{NODE_HELP[nodeType]}</p>
        </div>
      )}

      <div className="space-y-3">
        <div>
          <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Label</label>
          <input
            type="text"
            value={d.label ?? ""}
            onChange={(e) => updateField("label", e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white focus:border-cyan focus:outline-none"
          />
        </div>

        {nodeType === "cron-trigger" && (
          <div>
            <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Cron Expression</label>
            <input
              type="text"
              value={String(d.cron_expression ?? "")}
              onChange={(e) => updateField("cron_expression", e.target.value)}
              placeholder="*/5 * * * *"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white font-mono placeholder-slate-600 focus:border-cyan focus:outline-none"
            />
            <div className="mt-2 space-y-1">
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider">Presets</p>
              {[
                { expr: "*/5 * * * *", label: "Every 5 min" },
                { expr: "*/15 * * * *", label: "Every 15 min" },
                { expr: "*/30 * * * *", label: "Every 30 min" },
                { expr: "0 * * * *", label: "Hourly" },
                { expr: "0 6 * * *", label: "Daily 8am SAST" },
                { expr: "0 6 * * 1-5", label: "Weekdays 8am SAST" },
              ].map((p) => (
                <button
                  key={p.expr}
                  onClick={() => updateField("cron_expression", p.expr)}
                  className="block w-full text-left rounded px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-white/5 hover:text-[var(--text-primary)] transition"
                >
                  <span className="font-mono text-cyan-400">{p.expr}</span>
                  <span className="ml-2 text-[var(--text-tertiary)]">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {nodeType === "http-request" && (
          <>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Method</label>
                <select
                  value={String(d.method ?? "GET")}
                  onChange={(e) => updateField("method", e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-2 text-sm text-white focus:border-cyan focus:outline-none"
                >
                  <option>GET</option>
                  <option>POST</option>
                  <option>PUT</option>
                  <option>PATCH</option>
                  <option>DELETE</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Timeout (ms)</label>
                <input
                  type="number"
                  value={Number(d.timeout ?? 10000)}
                  onChange={(e) => updateField("timeout", Number(e.target.value))}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white focus:border-cyan focus:outline-none"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">URL</label>
              <input
                type="text"
                value={String(d.url ?? "")}
                onChange={(e) => updateField("url", e.target.value)}
                placeholder="https://example.com/api/..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Body (JSON)</label>
              <textarea
                value={String(d.body ?? "")}
                onChange={(e) => updateField("body", e.target.value)}
                rows={3}
                placeholder='{"key": "value"}'
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white font-mono placeholder-slate-600 focus:border-cyan focus:outline-none resize-none"
              />
            </div>
          </>
        )}

        {nodeType === "condition" && (
          <>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Field</label>
              <input
                type="text"
                value={String(d.field ?? "")}
                onChange={(e) => updateField("field", e.target.value)}
                placeholder="status, body, httpStatus..."
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Operator</label>
                <select
                  value={String(d.operator ?? "eq")}
                  onChange={(e) => updateField("operator", e.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-2 text-sm text-white focus:border-cyan focus:outline-none"
                >
                  <option value="eq">equals</option>
                  <option value="neq">not equals</option>
                  <option value="gt">greater than</option>
                  <option value="lt">less than</option>
                  <option value="gte">greater or equal</option>
                  <option value="lte">less or equal</option>
                  <option value="contains">contains</option>
                  <option value="not_contains">not contains</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Value</label>
                <input
                  type="text"
                  value={String(d.value ?? "")}
                  onChange={(e) => updateField("value", e.target.value)}
                  placeholder="200"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan focus:outline-none"
                />
              </div>
            </div>
          </>
        )}

        {nodeType === "notify" && (
          <>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Channel</label>
              <select
                value={String(d.channel ?? "telegram")}
                onChange={(e) => updateField("channel", e.target.value)}
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-2 text-sm text-white focus:border-cyan focus:outline-none"
              >
                <option value="telegram">Telegram</option>
                <option value="log">Log Only</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                Message <span className="normal-case text-[var(--text-tertiary)]">({'{{'}status{'}}'}  {'{{'}body{'}}'})</span>
              </label>
              <textarea
                value={String(d.message ?? "")}
                onChange={(e) => updateField("message", e.target.value)}
                rows={3}
                placeholder="Workflow completed. Status: {{status}}"
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-white placeholder-slate-600 focus:border-cyan focus:outline-none resize-none"
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Add Node Palette ──────────────────────────────────────────────────────────

const PALETTE_ITEMS = [
  { type: "manual-trigger", label: "Manual Trigger", icon: "\u25B6", color: "#00D47E", description: "Start this workflow by clicking Run Now" },
  { type: "cron-trigger", label: "Cron Trigger", icon: "\u23F0", color: "#06b6d4", description: "Run this workflow on a schedule (e.g. every 5 minutes)" },
  { type: "http-request", label: "HTTP Request", icon: "\u21C5", color: "#3b82f6", description: "Make an API call to any URL" },
  { type: "condition", label: "Condition", icon: "\u2747", color: "#f59e0b", description: "Branch the workflow based on a condition (if/else)" },
  { type: "notify", label: "Notify", icon: "\u2709", color: "#00D47E", description: "Send a notification via Telegram or log" },
];

function NodePalette({ onAdd }: { onAdd: (type: string) => void }) {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);

  return (
    <div className="flex gap-2 relative">
      {PALETTE_ITEMS.map((item) => (
        <div key={item.type} className="relative">
          <button
            onClick={() => onAdd(item.type)}
            onMouseEnter={() => setHoveredItem(item.type)}
            onMouseLeave={() => setHoveredItem(null)}
            className="flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition hover:scale-105 active:scale-95"
            style={{
              borderColor: `${item.color}40`,
              background: `${item.color}10`,
              color: item.color,
            }}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </button>
          {hoveredItem === item.type && (
            <div className="absolute top-full left-0 mt-2 z-50 w-52 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 shadow-xl pointer-events-none">
              <p className="text-[11px] text-[var(--text-primary)]">{item.description}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main Builder Component ────────────────────────────────────────────────────

const nodeTypes = {
  "manual-trigger": ManualTriggerNode,
  "cron-trigger": CronTriggerNode,
  "http-request": HttpRequestNode,
  "condition": ConditionNode,
  "notify": NotifyNode,
};

const defaultEdgeOptions = {
  animated: true,
  style: { stroke: "#8888A0", strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: "#8888A0" },
};

export function WorkflowBuilder({
  definition,
  onChange,
  readOnly = false,
}: {
  definition: WorkflowDefinition;
  onChange: (def: WorkflowDefinition) => void;
  readOnly?: boolean;
}) {
  const initialNodes: Node[] = definition.nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: n.data,
    draggable: !readOnly,
    selectable: !readOnly,
  }));

  const initialEdges: Edge[] = definition.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    ...defaultEdgeOptions,
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  // Sync back to parent on any change
  const syncDefinition = useCallback(
    (newNodes: Node[], newEdges: Edge[]) => {
      onChange({
        nodes: newNodes.map((n) => ({
          id: n.id,
          type: n.type ?? "unknown",
          position: n.position,
          data: n.data as Record<string, unknown>,
        })),
        edges: newEdges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          sourceHandle: e.sourceHandle ?? undefined,
        })),
      });
    },
    [onChange]
  );

  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      // We need to get the updated nodes after the change
      setNodes((nds) => {
        // The state is already updated by onNodesChange, so we schedule a sync
        setTimeout(() => {
          syncDefinition(nds, edges);
        }, 0);
        return nds;
      });
    },
    [onNodesChange, setNodes, edges, syncDefinition]
  );

  const handleEdgesChange = useCallback(
    (changes: Parameters<typeof onEdgesChange>[0]) => {
      onEdgesChange(changes);
      setEdges((eds) => {
        setTimeout(() => {
          syncDefinition(nodes, eds);
        }, 0);
        return eds;
      });
    },
    [onEdgesChange, setEdges, nodes, syncDefinition]
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge({ ...connection, ...defaultEdgeOptions }, eds);
        syncDefinition(nodes, newEdges);
        return newEdges;
      });
    },
    [setEdges, nodes, syncDefinition]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (!readOnly) setSelectedNode(node);
  }, [readOnly]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const handleNodeUpdate = useCallback(
    (id: string, data: Record<string, unknown>) => {
      setNodes((nds) => {
        const updated = nds.map((n) => (n.id === id ? { ...n, data } : n));
        syncDefinition(updated, edges);
        return updated;
      });
      setSelectedNode((prev) => (prev?.id === id ? { ...prev, data } : prev));
    },
    [setNodes, edges, syncDefinition]
  );

  const addNode = useCallback(
    (type: string) => {
      const id = `node_${Date.now()}`;
      const defaults: Record<string, Record<string, unknown>> = {
        "manual-trigger": { label: "Manual Trigger" },
        "cron-trigger": { label: "Cron Trigger", cron_expression: "*/5 * * * *" },
        "http-request": { label: "HTTP Request", method: "GET", url: "", headers: {}, timeout: 10000 },
        "condition": { label: "Condition", field: "status", operator: "eq", value: "200" },
        "notify": { label: "Notify", channel: "telegram", message: "" },
      };

      const newNode: Node = {
        id,
        type,
        position: { x: 250 + Math.random() * 100, y: 100 + nodes.length * 150 },
        data: defaults[type] ?? { label: type },
      };

      setNodes((nds) => {
        const updated = [...nds, newNode];
        syncDefinition(updated, edges);
        return updated;
      });
    },
    [nodes.length, setNodes, edges, syncDefinition]
  );

  const deleteSelected = useCallback(() => {
    if (!selectedNode) return;
    setNodes((nds) => {
      const updated = nds.filter((n) => n.id !== selectedNode.id);
      setEdges((eds) => {
        const updatedEdges = eds.filter(
          (e) => e.source !== selectedNode.id && e.target !== selectedNode.id
        );
        syncDefinition(updated, updatedEdges);
        return updatedEdges;
      });
      return updated;
    });
    setSelectedNode(null);
  }, [selectedNode, setNodes, setEdges, syncDefinition]);

  const rfNodeTypes = useMemo(() => nodeTypes, []);

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={readOnly ? undefined : handleNodesChange}
        onEdgesChange={readOnly ? undefined : handleEdgesChange}
        onConnect={readOnly ? undefined : onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={rfNodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        className="bg-[var(--bg-primary)]"
      >
        <Background color="#1E1E2A" gap={20} size={1} />
        <MiniMap
          nodeStrokeColor="#1E1E2A"
          nodeColor="#111118"
          maskColor="rgba(10,10,20,0.8)"
          className="!bg-[var(--bg-surface)] !border-[var(--border)]"
        />
        <Controls className="!bg-[var(--bg-surface)] !border-[var(--border)] !shadow-lg [&>button]:!bg-[var(--bg-surface)] [&>button]:!border-[var(--border)] [&>button]:!text-[var(--text-secondary)] [&>button:hover]:!bg-[#1a1a2e]" />

        {!readOnly && (
          <Panel position="top-left">
            <NodePalette onAdd={addNode} />
          </Panel>
        )}

        {!readOnly && selectedNode && (
          <Panel position="top-right">
            <div className="flex gap-2">
              <button
                onClick={deleteSelected}
                className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 transition"
              >
                Delete Node
              </button>
            </div>
          </Panel>
        )}
      </ReactFlow>

      {selectedNode && !readOnly && (
        <NodeConfigPanel
          node={selectedNode}
          onUpdate={handleNodeUpdate}
          onClose={() => setSelectedNode(null)}
        />
      )}
    </div>
  );
}
