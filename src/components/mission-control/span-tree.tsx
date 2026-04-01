"use client";

import { useMemo, useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Span } from "@/app/traces/[traceId]/page";

// Type colors — LLM=emerald, tool=blue, retrieval=teal, chain=gray, error=red
const TYPE_COLORS: Record<string, { color: string; bg: string; label: string }> = {
  llm:       { color: "#00D47E", bg: "rgba(0, 212, 126, 0.12)",  label: "LLM" },
  tool:      { color: "#06B6D4", bg: "rgba(6, 182, 212, 0.12)",  label: "Tool" },
  retrieval: { color: "#14B8A6", bg: "rgba(20, 184, 166, 0.12)", label: "RAG" },
  chain:     { color: "#8888A0", bg: "rgba(136, 136, 160, 0.12)", label: "Chain" },
  agent:     { color: "#F59E0B", bg: "rgba(245, 158, 11, 0.12)", label: "Agent" },
};

interface TreeNode {
  span: Span;
  children: TreeNode[];
  depth: number;
}

function buildTree(spans: Span[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  // Create nodes
  for (const span of spans) {
    map.set(span.span_id, { span, children: [], depth: 0 });
  }

  // Link children
  for (const span of spans) {
    const node = map.get(span.span_id)!;
    if (span.parent_span_id && map.has(span.parent_span_id)) {
      const parent = map.get(span.parent_span_id)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Fix depths recursively
  function setDepths(node: TreeNode, depth: number) {
    node.depth = depth;
    for (const child of node.children) setDepths(child, depth + 1);
  }
  roots.forEach((r) => setDepths(r, 0));

  return roots;
}

interface SpanTreeProps {
  spans: Span[];
  selectedSpanId: string | null;
  onSelectSpan: (span: Span) => void;
  traceDuration: number;
}

export function SpanTree({ spans, selectedSpanId, onSelectSpan, traceDuration }: SpanTreeProps) {
  const tree = useMemo(() => buildTree(spans), [spans]);

  return (
    <div className="space-y-0.5">
      {tree.map((node) => (
        <SpanTreeNode
          key={node.span.span_id}
          node={node}
          selectedSpanId={selectedSpanId}
          onSelectSpan={onSelectSpan}
          traceDuration={traceDuration}
        />
      ))}
    </div>
  );
}

function SpanTreeNode({
  node,
  selectedSpanId,
  onSelectSpan,
  traceDuration,
}: {
  node: TreeNode;
  selectedSpanId: string | null;
  onSelectSpan: (span: Span) => void;
  traceDuration: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedSpanId === node.span.span_id;
  const typeConfig = TYPE_COLORS[node.span.type] || TYPE_COLORS.chain;
  const isError = node.span.status === "error";

  // Duration bar width relative to trace
  const barWidth = traceDuration > 0 && node.span.duration_ms
    ? Math.max(4, (node.span.duration_ms / traceDuration) * 100)
    : 0;

  const fmtDur = node.span.duration_ms != null
    ? node.span.duration_ms < 1000 ? `${node.span.duration_ms}ms` : `${(node.span.duration_ms / 1000).toFixed(1)}s`
    : "";

  return (
    <div>
      <button
        onClick={() => onSelectSpan(node.span)}
        className={`group flex w-full items-center gap-1.5 rounded-lg px-2 py-1.5 text-left transition-colors ${
          isSelected
            ? "bg-[rgba(0,212,126,0.08)] border border-[rgba(0,212,126,0.2)]"
            : "hover:bg-[var(--bg-surface-2)] border border-transparent"
        }`}
        style={{ paddingLeft: `${8 + node.depth * 20}px` }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <span
            onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed); }}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
          >
            {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </span>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Type badge */}
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider"
          style={{ color: isError ? "#EF4444" : typeConfig.color, background: isError ? "rgba(239,68,68,0.12)" : typeConfig.bg }}
        >
          {typeConfig.label}
        </span>

        {/* Name */}
        <span className={`min-w-0 truncate text-xs ${isSelected ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}`}>
          {node.span.name || "unnamed"}
        </span>

        {/* Duration bar + text */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {barWidth > 0 && (
            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--bg-surface-2)]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(barWidth, 100)}%`,
                  background: isError ? "#EF4444" : typeConfig.color,
                  opacity: 0.6,
                }}
              />
            </div>
          )}
          <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{fmtDur}</span>
        </div>
      </button>

      {/* Children */}
      {hasChildren && !collapsed && (
        <div>
          {node.children.map((child) => (
            <SpanTreeNode
              key={child.span.span_id}
              node={child}
              selectedSpanId={selectedSpanId}
              onSelectSpan={onSelectSpan}
              traceDuration={traceDuration}
            />
          ))}
        </div>
      )}
    </div>
  );
}
