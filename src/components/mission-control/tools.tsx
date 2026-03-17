"use client";

import DOMPurify from "dompurify";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { marked } from "marked";
import { toast } from "sonner";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  Card,
  ErrorState,
  LoadingState,
  SectionTitle,
  ShellHeader,
  StatCard,
} from "./dashboard";

type FetchState<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
};

type ApprovalItem = {
  id: number;
  agent_id: string;
  title: string;
  content: string;
  content_type: string;
  target_channel: string | null;
  target_destination: string | null;
  metadata: Record<string, unknown>;
  status: string;
  priority: string;
  created_at: string;
  reviewed_at: string | null;
  sent_at: string | null;
  reviewer_note: string | null;
  expires_at: string | null;
  agent_name?: string;
};

type DocumentItem = {
  id: number;
  agent_id: string;
  title: string;
  category: string;
  content: string;
  content_format: string;
  file_path: string | null;
  tags: string[];
  pinned: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  word_count: number | null;
  preview?: string;
};

type TaskItem = {
  id: number;
  agent_id: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assignee: string;
  category: string | null;
  due_date: string | null;
  completed_at: string | null;
  sort_order: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

type CalendarItem = {
  id: number;
  agent_id: string | null;
  title: string;
  description: string | null;
  item_type: string;
  scheduled_at: string;
  duration_minutes: number | null;
  status: string;
  target_channel: string | null;
  linked_approval_id: number | null;
  linked_task_id: number | null;
  color: string | null;
  recurring: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

type SubagentRun = {
  id: number;
  agent_id: string;
  run_label: string;
  model: string;
  task_summary: string | null;
  status: string;
  started_at: string;
  completed_at: string | null;
  last_output: string | null;
  output_path: string | null;
  output_size_bytes: number | null;
  token_count: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  session_id: string | null;
};

type QuickCommand = {
  id: number;
  agent_id: string;
  command: string;
  response: string | null;
  status: string;
  created_at: string;
  responded_at: string | null;
};

marked.setOptions({ breaks: true, gfm: true });

function renderMarkdown(content: string): string {
  const raw = marked(content) as string;
  // SEC-4: Sanitise HTML before injection to prevent XSS
  if (typeof window !== "undefined" && DOMPurify.isSupported) {
    return DOMPurify.sanitize(raw, {
      ALLOWED_TAGS: ["h1","h2","h3","h4","h5","h6","p","ul","ol","li","a","strong","em","code","pre","blockquote","table","thead","tbody","tr","th","td","hr","br","img","span","div"],
      ALLOWED_ATTR: ["href","src","alt","class","id","target","rel"],
      FORCE_BODY: true,
    });
  }
  return raw;
}

function getAuthHeaders(): Record<string, string> {
  const token = "";
  const csrf = typeof document !== "undefined"
    ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
  const h: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (csrf) h["x-csrf-token"] = decodeURIComponent(csrf);
  return h;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error || `${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

function usePollingData<T>(url: string, intervalMs = 15000) {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      try {
        const data = await fetchJson<T>(url);
        if (!mounted) return;
        setState({ data, error: null, loading: false });
      } catch (error) {
        if (!mounted) return;
        setState((current) => ({
          data: current.data,
          error: error instanceof Error ? error.message : "Request failed",
          loading: false,
        }));
      }
    };

    run();
    const timer = window.setInterval(run, intervalMs);

    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, [intervalMs, url]);

  return state;
}

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);

  return now;
}

function formatDate(value: string | null | undefined, options?: Intl.DateTimeFormatOptions) {
  if (!value) return "No date";
  return new Date(value).toLocaleString("en-ZA", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...options,
  });
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "No date";
  return new Date(value).toLocaleDateString("en-ZA", {
    month: "short",
    day: "numeric",
  });
}

function timeAgo(value: string | null | undefined) {
  if (!value) return "Now";
  const diffMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function elapsedLabel(startedAt: string, completedAt: string | null, now: number) {
  const end = completedAt ? new Date(completedAt).getTime() : now;
  const totalSeconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function toneClass(color: "cyan" | "purple" | "amber" | "green" | "red" | "slate") {
  return {
    cyan: "border-cyan/30 bg-cyan/10 text-cyan",
    purple: "border-purple/30 bg-purple/10 text-purple",
    amber: "border-amber/30 bg-amber/10 text-amber",
    green: "border-green/30 bg-green/10 text-green",
    red: "border-red/30 bg-red/10 text-red",
    slate: "border-border bg-bg-deep/80 text-text-dim",
  }[color];
}

function Pill({
  active,
  children,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${
        active
          ? "border-cyan/40 bg-cyan/15 text-cyan"
          : "border-border bg-bg-deep/80 text-text-dim"
      }`}
    >
      {children}
    </button>
  );
}

function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "cyan" | "purple" | "amber" | "green" | "red" | "slate";
}) {
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClass(tone)}`}>
      {children}
    </span>
  );
}

function BottomSheet({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60">
      <button type="button" className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <div className="relative max-h-[78vh] w-full overflow-y-auto rounded-t-[28px] border border-border bg-bg-card p-5 shadow-[0_-20px_60px_rgba(0,0,0,0.45)]">
        <div className="mx-auto mb-4 h-1.5 w-16 rounded-full bg-border" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-text">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-border px-3 text-sm text-text-dim"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return <div className="rounded-2xl border border-dashed border-border p-5 text-sm text-text-dim">{label}</div>;
}

const toolLinks = [
  { href: "/tools/approvals", title: "Approvals Queue", note: "Review drafted content and approve or reject from the phone.", tone: "green" as const },
  { href: "/tools/docs", title: "Docs Viewer", note: "Searchable archive of specs, reports, logs, and plans.", tone: "cyan" as const },
  { href: "/tools/tasks", title: "Task Board", note: "Kanban board for Brynn and Lumina priorities.", tone: "amber" as const },
  { href: "/tools/calendar", title: "Content Calendar", note: "Week-first content schedule with day drill-down.", tone: "purple" as const },
  { href: "/tools/agents-live", title: "Sub-Agent Live", note: "Real-time status, logs, tokens, and kill controls.", tone: "green" as const },
  { href: "/tools/command", title: "Quick Command", note: "Chat-like command surface for direct requests to Lumina.", tone: "cyan" as const },
  { href: "/actions", title: "Actions", note: "Existing action list remains available from the hub.", tone: "slate" as const },
  { href: "/confessions", title: "Confessions", note: "Mission-aligned declarations and scriptures.", tone: "purple" as const },
  { href: "/visuals", title: "Visuals", note: "Visual briefing and live diagrams.", tone: "amber" as const },
];

export function ToolsHubScreen() {
  return (
    <div className="space-y-5">
      <ShellHeader
        title="Tools"
        subtitle="Operational cockpit for approvals, documents, tasks, schedules, sub-agents, and quick command dispatch."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Custom Tools" value="6" accent="text-cyan" sublabel="Interactive operational surfaces" />
        <StatCard label="Mobile First" value="44px+" accent="text-purple" sublabel="Touch targets and sticky controls" />
        <StatCard label="Live Ops" value="5s" accent="text-amber" sublabel="Polling cadence for active runs" />
        <StatCard label="Theme" value="PWA" accent="text-green" sublabel="Arkon dark shell reused" />
      </div>

      <Card>
        <SectionTitle title="Tool Grid" note="Arkon phase 5" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {toolLinks.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="min-h-28 rounded-[22px] border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))] p-4 transition hover:border-cyan/40"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <Badge tone={tool.tone}>{tool.title}</Badge>
                <span className="text-xs text-text-dim">Open</span>
              </div>
              <p className="text-sm leading-6 text-text-dim">{tool.note}</p>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}

export function ApprovalsToolScreen() {
  const [filter, setFilter] = useState("all");
  const [mutatingId, setMutatingId] = useState<number | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [noteInput, setNoteInput] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  const [offsets, setOffsets] = useState<Record<number, number>>({});
  const touchStart = useRef<Record<number, number>>({});
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading } = usePollingData<{ items: ApprovalItem[]; pendingCount: number }>(
    `/api/tools/approvals?status=${filter}&_r=${refreshKey}`,
    12000
  );

  const revalidate = () => setRefreshKey((k) => k + 1);

  const updateStatus = async (id: number, status: string, reviewerNote?: string) => {
    setMutatingId(id);
    try {
      await fetchJson(`/api/tools/approvals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reviewer_note: reviewerNote || null }),
      });
      revalidate();
      toast.success(`Approval ${status}`);
    } catch (mutationError) {
      toast.error(mutationError instanceof Error ? mutationError.message : "Update failed");
    } finally {
      setMutatingId(null);
      setOffsets((current) => ({ ...current, [id]: 0 }));
    }
  };

  const bulkAction = async (status: string) => {
    for (const id of selectedIds) {
      await updateStatus(id, status);
    }
    setSelectedIds(new Set());
    setBulkMode(false);
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading && !data) return <LoadingState label="Loading approvals" />;

  const pendingItems = data?.items.filter((i) => i.status === "pending") ?? [];

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Approvals Queue"
        subtitle="Review, approve, or reject agent content. Swipe or use buttons. Add notes for audit trail."
        action={<Badge tone="amber">{data?.pendingCount ?? 0} pending</Badge>}
      />

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {["all", "pending", "approved", "rejected", "expired"].map((tab) => (
          <Pill key={tab} active={filter === tab} onClick={() => setFilter(tab)}>
            {tab[0]?.toUpperCase()}{tab.slice(1)}
          </Pill>
        ))}
        <div className="flex-1" />
        {pendingItems.length > 1 && (
          <button
            type="button"
            onClick={() => { setBulkMode(!bulkMode); setSelectedIds(new Set()); }}
            className={`min-h-9 rounded-xl border px-3 text-xs font-semibold transition ${
              bulkMode ? "border-cyan/40 bg-cyan/15 text-cyan" : "border-border bg-bg-deep/80 text-text-dim"
            }`}
          >
            {bulkMode ? "Cancel" : "Bulk"}
          </button>
        )}
      </div>

      {bulkMode && selectedIds.size > 0 && (
        <div className="flex items-center gap-3 rounded-2xl border border-cyan/30 bg-cyan/5 p-3">
          <span className="text-sm text-cyan font-medium">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button type="button" onClick={() => void bulkAction("rejected")}
            className="min-h-9 rounded-xl border border-red/30 bg-red/10 px-4 text-xs font-semibold text-red">
            Reject All
          </button>
          <button type="button" onClick={() => void bulkAction("approved")}
            className="min-h-9 rounded-xl border border-green/30 bg-green/10 px-4 text-xs font-semibold text-green">
            Approve All
          </button>
        </div>
      )}

      {data?.items.length ? (
        <div className="space-y-4">
          {data.items.map((item) => {
            const offset = offsets[item.id] ?? 0;
            const isExpanded = expandedId === item.id;
            const isSelected = selectedIds.has(item.id);
            return (
              <div
                key={item.id}
                className={`rounded-[24px] transition ${
                  isSelected ? "ring-2 ring-cyan/40" :
                  offset > 40 ? "shadow-[0_0_40px_rgba(34,197,94,0.15)]" :
                  offset < -40 ? "shadow-[0_0_40px_rgba(239,68,68,0.18)]" : ""
                }`}
              >
                <Card className="transition-transform">
                  <div
                    className="space-y-4"
                    style={{ transform: `translateX(${offset}px)` }}
                    onTouchStart={(event) => {
                      touchStart.current[item.id] = event.touches[0]?.clientX ?? 0;
                    }}
                    onTouchMove={(event) => {
                      const start = touchStart.current[item.id] ?? 0;
                      const delta = (event.touches[0]?.clientX ?? 0) - start;
                      setOffsets((current) => ({ ...current, [item.id]: Math.max(-120, Math.min(120, delta)) }));
                    }}
                    onTouchEnd={() => {
                      const delta = offsets[item.id] ?? 0;
                      if (delta > 96) { void updateStatus(item.id, "approved"); return; }
                      if (delta < -96) { void updateStatus(item.id, "rejected"); return; }
                      setOffsets((current) => ({ ...current, [item.id]: 0 }));
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        {bulkMode && item.status === "pending" && (
                          <button type="button" onClick={() => toggleSelect(item.id)}
                            className={`mt-1 h-5 w-5 rounded border flex-shrink-0 flex items-center justify-center transition ${
                              isSelected ? "border-cyan bg-cyan text-black" : "border-border"
                            }`}>
                            {isSelected && <span className="text-xs">\u2713</span>}
                          </button>
                        )}
                        <div>
                          <div className="flex flex-wrap gap-2">
                            <Badge tone={
                              item.status === "pending" ? "amber" :
                              item.status === "approved" ? "green" :
                              item.status === "expired" ? "slate" : "red"
                            }>
                              {item.status}
                            </Badge>
                            <Badge tone="purple">{item.target_channel ?? "general"}</Badge>
                            <Badge tone={item.priority === "urgent" ? "red" : item.priority === "low" ? "slate" : "cyan"}>
                              {item.priority}
                            </Badge>
                            {item.expires_at && item.status === "pending" && (
                              <Badge tone="slate">expires {formatShortDate(item.expires_at)}</Badge>
                            )}
                          </div>
                          <h2 className="mt-3 text-lg font-semibold text-text">{item.title}</h2>
                          <p className="mt-1 text-xs text-text-dim">
                            {item.agent_name || item.agent_id} \u00b7 {timeAgo(item.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="text-right text-xs text-text-dim">
                        <div>{item.target_destination ?? "No destination"}</div>
                        {item.reviewed_at ? <div className="mt-1">Reviewed {formatShortDate(item.reviewed_at)}</div> : null}
                      </div>
                    </div>

                    {/* Content — expandable */}
                    <div
                      className="cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    >
                      <p className={`text-sm leading-6 text-text ${isExpanded ? "" : "line-clamp-3"}`}>
                        {item.content}
                      </p>
                      {!isExpanded && item.content.length > 200 && (
                        <span className="text-xs text-cyan mt-1 inline-block">Show more \u2193</span>
                      )}
                      {isExpanded && (
                        <span className="text-xs text-text-dim mt-1 inline-block">Show less \u2191</span>
                      )}
                    </div>

                    {/* Reviewer note display */}
                    {item.reviewer_note ? (
                      <div className="rounded-2xl border border-border bg-bg-deep/70 p-3 text-sm text-text-dim">
                        <span className="text-xs font-semibold text-text-dim block mb-1">Reviewer Note</span>
                        {item.reviewer_note}
                      </div>
                    ) : null}

                    {/* Reviewer note input (for pending items) */}
                    {item.status === "pending" && (
                      <input
                        type="text"
                        placeholder="Add a note (optional)..."
                        value={noteInput[item.id] ?? ""}
                        onChange={(e) => setNoteInput((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-full rounded-xl border border-border bg-bg-deep/50 px-3 py-2 text-sm text-text placeholder:text-text-dim/50 focus:border-cyan/40 focus:outline-none"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}

                    {/* Action buttons */}
                    {item.status === "pending" && !bulkMode && (
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          disabled={mutatingId === item.id}
                          onClick={() => void updateStatus(item.id, "rejected", noteInput[item.id])}
                          className="min-h-11 rounded-2xl border border-red/30 bg-red/10 text-sm font-semibold text-red"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={mutatingId === item.id}
                          onClick={() => void updateStatus(item.id, "approved", noteInput[item.id])}
                          className="min-h-11 rounded-2xl border border-green/30 bg-green/10 text-sm font-semibold text-green"
                        >
                          Approve
                        </button>
                      </div>
                    )}
                  </div>
                </Card>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState label="No approvals match the current filter." />
      )}

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}


const docCategories = ["all", "sop", "spec", "report", "log", "plan", "research", "guide", "brief", "other"];

export function DocsToolScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selected, setSelected] = useState<DocumentItem | null>(null);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const selectedId = searchParams.get("id");
  const deferredSearch = useDeferredValue(search.trim());
  const queryString = `/api/tools/docs?category=${category}${deferredSearch ? `&search=${encodeURIComponent(deferredSearch)}` : ""}`;
  const { data, error, loading } = usePollingData<{ items: DocumentItem[] }>(queryString, 20000);

  const openDoc = async (id: number) => {
    try {
      setLoadingDoc(true);
      const document = await fetchJson<DocumentItem>(`/api/tools/docs/${id}`);
      setSelected(document);
      router.replace(`/tools/docs?id=${id}`);
    } catch (openError) {
      toast.error(openError instanceof Error ? openError.message : 'Open failed');
    } finally {
      setLoadingDoc(false);
    }
  };

  const togglePin = async (doc: DocumentItem) => {
    try {
      const updated = await fetchJson<DocumentItem>(`/api/tools/docs/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pinned: !doc.pinned }),
      });
      if (selected?.id === updated.id) setSelected(updated);
      window.location.reload();
    } catch (pinError) {
      toast.error(pinError instanceof Error ? pinError.message : 'Pin failed');
    }
  };

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      setLoadingDoc(false);
      return;
    }

    const parsedId = Number.parseInt(selectedId, 10);
    if (!Number.isFinite(parsedId)) {
      setSelected(null);
      setLoadingDoc(false);
      return;
    }
    if (selected?.id === parsedId) return;

    let mounted = true;

    const run = async () => {
      try {
        setLoadingDoc(true);
        const document = await fetchJson<DocumentItem>(`/api/tools/docs/${parsedId}`);
        if (!mounted) return;
        setSelected(document);
      } catch (openError) {
        if (!mounted) return;
        toast.error(openError instanceof Error ? openError.message : 'Open failed');
      } finally {
        if (mounted) setLoadingDoc(false);
      }
    };

    void run();

    return () => {
      mounted = false;
    };
  }, [selected?.id, selectedId]);

  const clearSelection = () => {
    setSelected(null);
    router.replace("/tools/docs");
  };

  if (loading && !data) return <LoadingState label="Loading docs" />;

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Docs Viewer"
        subtitle="Sticky search, category pills, and a full-screen markdown viewer for plans, logs, briefs, and reports."
      />

      <div className="sticky top-0 z-20 -mx-4 border-b border-border bg-bg-deep/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search titles and content"
          className="min-h-11 w-full rounded-2xl border border-border bg-bg-card px-4 text-sm text-text outline-none"
        />
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {docCategories.map((pill) => (
            <Pill key={pill} active={category === pill} onClick={() => setCategory(pill)}>
              {pill === "all" ? "All" : pill}
            </Pill>
          ))}
        </div>
      </div>

      {selected || loadingDoc ? (
        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-4 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <button
                  type="button"
                  onClick={clearSelection}
                  className="mb-3 text-sm font-semibold text-cyan"
                >
                  ← Back to documents
                </button>
                <div className="flex flex-wrap gap-2">
                  {selected ? <Badge tone="purple">{selected.category}</Badge> : null}
                  {selected?.pinned ? <Badge tone="amber">Pinned</Badge> : null}
                  {selected?.file_path ? <Badge tone="slate">{selected.file_path}</Badge> : null}
                </div>
                <h2 className="mt-3 text-2xl font-semibold text-text">
                  {selected?.title ?? "Loading document"}
                </h2>
                <p className="mt-2 text-sm text-text-dim">
                  {selected
                    ? `${formatShortDate(selected.updated_at)} · ${selected.word_count ?? 0} words`
                    : "Fetching document content"}
                </p>
              </div>
              {selected ? (
                <button
                  type="button"
                  onClick={() => void togglePin(selected)}
                  className="min-h-11 rounded-xl border border-border px-3 text-sm text-amber"
                >
                  {selected.pinned ? "Unpin" : "Pin"}
                </button>
              ) : null}
            </div>
          </div>

          <div className="px-4 py-5 sm:px-6">
            {selected ? (
              selected.content_format === "html" ? (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: selected.content }}
                />
              ) : (
                <div
                  className="markdown-body"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(selected.content) }}
                />
              )
            ) : (
              <LoadingState label="Loading document" />
            )}
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {data?.items.length ? (
            data.items.map((doc) => (
              <div
                key={doc.id}
                role="button"
                tabIndex={0}
                onClick={() => void openDoc(doc.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void openDoc(doc.id);
                  }
                }}
                className="w-full text-left"
              >
                <Card className="space-y-3 transition hover:border-cyan/40">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="purple">{doc.category}</Badge>
                        {doc.pinned ? <Badge tone="amber">Pinned</Badge> : null}
                      </div>
                      <h2 className="mt-3 text-lg font-semibold text-text">{doc.title}</h2>
                      <p className="mt-1 text-xs text-text-dim">
                        {formatShortDate(doc.updated_at)} · {doc.word_count ?? 0} words
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void togglePin(doc);
                      }}
                      className="min-h-11 rounded-xl border border-border px-3 text-sm text-amber"
                    >
                      {doc.pinned ? "Unpin" : "Pin"}
                    </button>
                  </div>
                  <p className="text-sm leading-6 text-text-dim">{doc.preview}</p>
                </Card>
              </div>
            ))
          ) : (
            <EmptyState label="No documents found for this search." />
          )}
        </div>
      )}

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

const taskTabs = [
  { id: "todo", label: "To Do" },
  { id: "in_progress", label: "Active" },
  { id: "done", label: "Done" },
];

function priorityTone(priority: string) {
  if (priority === "P1") return "red" as const;
  if (priority === "P2") return "amber" as const;
  return "slate" as const;
}

export function TasksToolScreen() {
  const [tab, setTab] = useState("todo");
  const [quickTitle, setQuickTitle] = useState("");
  const [quickPriority, setQuickPriority] = useState("P2");
  const { data, error, loading } = usePollingData<{ items: TaskItem[] }>("/api/tools/tasks", 12000);

  const groups = useMemo(() => {
    const items = data?.items ?? [];
    return {
      todo: items.filter((item) => item.status === "todo"),
      in_progress: items.filter((item) => item.status === "in_progress"),
      done: items.filter((item) => item.status === "done"),
    };
  }, [data?.items]);

  const createTask = async () => {
    if (!quickTitle.trim()) return;
    try {
      await fetchJson("/api/tools/tasks", {
        method: "POST",
        body: JSON.stringify({
          title: quickTitle,
          priority: quickPriority,
          assignee: "brynn",
          status: "todo",
        }),
      });
      setQuickTitle("");
      setQuickPriority("P2");
      window.location.reload();
    } catch (createError) {
      toast.error(createError instanceof Error ? createError.message : 'Create failed');
    }
  };

  const moveTask = async (task: TaskItem, direction: "forward" | "back") => {
    const flow = ["todo", "in_progress", "done"];
    const currentIndex = flow.indexOf(task.status);
    const nextIndex = direction === "forward" ? currentIndex + 1 : currentIndex - 1;
    if (nextIndex < 0 || nextIndex >= flow.length) return;

    try {
      await fetchJson(`/api/tools/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: flow[nextIndex] }),
      });
      window.location.reload();
    } catch (moveError) {
      toast.error(moveError instanceof Error ? moveError.message : 'Move failed');
    }
  };

  if (loading && !data) return <LoadingState label="Loading tasks" />;

  const renderTaskCard = (task: TaskItem) => {
    const overdue = task.due_date && new Date(task.due_date).getTime() < Date.now() && task.status !== "done";
    return (
      <Card key={task.id} className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={priorityTone(task.priority)}>{task.priority}</Badge>
              <Badge tone="cyan">{task.assignee}</Badge>
              {task.category ? <Badge tone="slate">{task.category}</Badge> : null}
            </div>
            <h3 className="mt-3 text-base font-semibold text-text">{task.title}</h3>
          </div>
          <div className="text-right text-xs text-text-dim">
            <div className={overdue ? "text-red" : ""}>{task.due_date ? formatShortDate(task.due_date) : "No due"}</div>
            <div className="mt-1">{task.status.replace("_", " ")}</div>
          </div>
        </div>
        {task.description ? <p className="text-sm leading-6 text-text-dim">{task.description}</p> : null}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => void moveTask(task, "back")}
            className="min-h-11 rounded-2xl border border-border bg-bg-deep/80 text-sm text-text-dim"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => void moveTask(task, "forward")}
            className="min-h-11 rounded-2xl border border-cyan/30 bg-cyan/10 text-sm font-semibold text-cyan"
          >
            Advance
          </button>
        </div>
      </Card>
    );
  };

  return (
    <div className="space-y-5 pb-24">
      <ShellHeader
        title="Task Board"
        subtitle="Mobile tabs for quick flow, with a three-column desktop view and a floating quick-add control."
      />

      <div className="flex gap-2 overflow-x-auto md:hidden">
        {taskTabs.map((taskTab) => (
          <Pill key={taskTab.id} active={tab === taskTab.id} onClick={() => setTab(taskTab.id)}>
            {taskTab.label} ({groups[taskTab.id as keyof typeof groups].length})
          </Pill>
        ))}
      </div>

      <div className="space-y-4 md:hidden">
        {groups[tab as keyof typeof groups].length ? (
          groups[tab as keyof typeof groups].map(renderTaskCard)
        ) : (
          <EmptyState label="No tasks in this column." />
        )}
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {taskTabs.map((column) => (
          <Card key={column.id} className="space-y-3">
            <SectionTitle title={column.label} note={`${groups[column.id as keyof typeof groups].length} tasks`} />
            <div className="space-y-3">
              {groups[column.id as keyof typeof groups].length ? (
                groups[column.id as keyof typeof groups].map(renderTaskCard)
              ) : (
                <EmptyState label="No tasks in this column." />
              )}
            </div>
          </Card>
        ))}
      </div>

      <div className="fixed bottom-[88px] right-4 z-40 w-[calc(100%-2rem)] max-w-sm rounded-[24px] border border-border bg-bg-card/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.4)] backdrop-blur">
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-text-dim">Quick Add</div>
        <input
          value={quickTitle}
          onChange={(event) => setQuickTitle(event.target.value)}
          placeholder="New task title"
          className="min-h-11 w-full rounded-2xl border border-border bg-bg-deep/80 px-3 text-sm text-text outline-none"
        />
        <div className="mt-2 flex gap-2">
          {["P1", "P2", "P3"].map((priority) => (
            <Pill key={priority} active={quickPriority === priority} onClick={() => setQuickPriority(priority)}>
              {priority}
            </Pill>
          ))}
          <button
            type="button"
            onClick={() => void createTask()}
            className="ml-auto min-h-11 rounded-full border border-cyan/30 bg-cyan/10 px-5 text-xl font-semibold text-cyan"
          >
            +
          </button>
        </div>
      </div>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

const itemTypeColors: Record<string, string> = {
  linkedin: "#3b82f6",
  email: "#06d6a0",
  campaign: "#8b5cf6",
  confession: "#f59e0b",
  task: "#64748b",
  event: "#22c55e",
  reminder: "#ef4444",
};

function getWeekStart(date = new Date()) {
  const target = new Date(date);
  const day = target.getDay();
  const diff = (day + 6) % 7;
  target.setDate(target.getDate() - diff);
  target.setHours(0, 0, 0, 0);
  return target;
}

export function CalendarToolScreen() {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  const { data, error, loading } = usePollingData<{ items: CalendarItem[] }>(
    `/api/tools/calendar?start=${weekStart.toISOString()}&end=${weekEnd.toISOString()}`,
    20000
  );

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [weekStart]);

  const itemsByDay = useMemo(() => {
    const grouped = new Map<string, CalendarItem[]>();
    for (const item of data?.items ?? []) {
      const key = new Date(item.scheduled_at).toISOString().slice(0, 10);
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
    return grouped;
  }, [data?.items]);

  const selectedItems = selectedDay ? itemsByDay.get(selectedDay) ?? [] : [];
  const todayKey = new Date().toISOString().slice(0, 10);

  if (loading && !data) return <LoadingState label="Loading calendar" />;

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Content Calendar"
        subtitle="Week view first, with a mobile-friendly horizontal grid, item dots, and a bottom-sheet day drill-down."
        action={
          <button
            type="button"
            onClick={() => setWeekStart(getWeekStart())}
            className="min-h-11 rounded-2xl border border-border px-4 text-sm text-text-dim"
          >
            Today
          </button>
        }
      />

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setWeekStart((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() - 7))}
            className="min-h-11 rounded-2xl border border-border px-4 text-sm text-text-dim"
          >
            Prev
          </button>
          <div className="text-sm font-semibold text-text">
            {formatShortDate(weekStart.toISOString())} - {formatShortDate(weekEnd.toISOString())}
          </div>
          <button
            type="button"
            onClick={() => setWeekStart((current) => new Date(current.getFullYear(), current.getMonth(), current.getDate() + 7))}
            className="min-h-11 rounded-2xl border border-border px-4 text-sm text-text-dim"
          >
            Next
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 text-xs text-text-dim md:flex md:flex-wrap">
          {Object.entries(itemTypeColors).map(([type, color]) => (
            <div key={type} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
              <span>{type}</span>
            </div>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto">
          <div className="grid min-w-[700px] grid-cols-7 gap-3">
            {days.map((day) => {
              const key = day.toISOString().slice(0, 10);
              const items = itemsByDay.get(key) ?? [];
              const isToday = key === todayKey;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedDay(key)}
                  className={`min-h-40 rounded-[22px] border p-3 text-left ${
                    isToday ? "border-cyan/40 bg-cyan/10" : "border-border bg-bg-deep/70"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.18em] text-text-dim">
                        {day.toLocaleDateString("en-ZA", { weekday: "short" })}
                      </div>
                      <div className={`mt-1 text-lg font-semibold ${isToday ? "text-cyan" : "text-text"}`}>
                        {day.getDate()}
                      </div>
                    </div>
                    {isToday ? <Badge tone="cyan">Today</Badge> : null}
                  </div>
                  <div className="mt-4 space-y-2">
                    {items.slice(0, 3).map((item) => (
                      <div key={item.id} className="flex items-center gap-2 text-xs text-text">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: item.color ?? itemTypeColors[item.item_type] ?? "#64748b" }}
                        />
                        <span className="truncate">{item.title}</span>
                      </div>
                    ))}
                    {items.length > 3 ? <div className="text-xs text-text-dim">+{items.length - 3} more</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <BottomSheet
        open={Boolean(selectedDay)}
        title={selectedDay ? `Schedule for ${formatDate(selectedDay, { month: "long", day: "numeric" })}` : "Day Detail"}
        onClose={() => setSelectedDay(null)}
      >
        <div className="space-y-3">
          {selectedItems.length ? (
            selectedItems.map((item) => (
              <Card key={item.id} className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone="purple">{item.item_type}</Badge>
                      <Badge tone={item.status === "published" ? "green" : item.status === "cancelled" ? "red" : "amber"}>
                        {item.status}
                      </Badge>
                    </div>
                    <h3 className="mt-3 text-base font-semibold text-text">{item.title}</h3>
                  </div>
                  <span className="text-xs text-text-dim">{formatDate(item.scheduled_at)}</span>
                </div>
                {item.description ? <p className="text-sm leading-6 text-text-dim">{item.description}</p> : null}
              </Card>
            ))
          ) : (
            <EmptyState label="No scheduled items for this day." />
          )}
        </div>
      </BottomSheet>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

function runTone(status: string) {
  if (status === "running") return "green" as const;
  if (status === "failed") return "red" as const;
  if (status === "completed") return "cyan" as const;
  if (status === "killed") return "slate" as const;
  return "amber" as const;
}

export function AgentsLiveToolScreen() {
  const now = useNow(1000);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const { data, error, loading } = usePollingData<{ items: SubagentRun[] }>("/api/tools/agents-live", 5000);

  const killRun = (run: SubagentRun) => {
    toast(`Kill agent "${run.run_label}"?`, {
      action: {
        label: "Confirm Kill",
        onClick: async () => {
          try {
            await fetchJson(`/api/tools/agents-live/${run.id}/kill`, { method: "POST" });
            toast.success(`Agent "${run.run_label}" terminated`);
            window.location.reload();
          } catch (killError) {
            toast.error(killError instanceof Error ? killError.message : "Kill failed");
          }
        },
      },
      cancel: { label: "Cancel", onClick: () => {} },
      duration: 8000,
    });
  };

  if (loading && !data) return <LoadingState label="Loading sub-agent runs" />;

  return (
    <div className="space-y-5">
      <ShellHeader
        title="Sub-Agent Live"
        subtitle="Active builders first, with real-time elapsed timers, token counts, logs, and guarded kill controls."
        action={<Badge tone="green">Auto refresh 5s</Badge>}
      />

      <div className="space-y-4">
        {data?.items.length ? (
          data.items.map((run) => (
            <Card key={run.id} className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`h-2.5 w-2.5 rounded-full ${run.status === "running" ? "animate-pulse bg-green" : run.status === "failed" ? "bg-red" : "bg-text-dim"}`}
                    />
                    <Badge tone={runTone(run.status)}>{run.status}</Badge>
                    <Badge tone="purple">{run.model}</Badge>
                  </div>
                  <h2 className="mt-3 text-lg font-semibold text-text">{run.run_label}</h2>
                  <p className="mt-1 text-sm text-text-dim">{run.task_summary ?? "No summary supplied."}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void killRun(run)}
                  disabled={run.status !== "running"}
                  className="min-h-11 rounded-2xl border border-red/30 bg-red/10 px-4 text-sm font-semibold text-red disabled:opacity-40"
                >
                  Kill
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-bg-deep/80 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-dim">Elapsed</div>
                  <div className="mt-2 text-base font-semibold text-text">
                    {elapsedLabel(run.started_at, run.completed_at, now)}
                  </div>
                </div>
                <div className="rounded-2xl bg-bg-deep/80 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-dim">Tokens</div>
                  <div className="mt-2 text-base font-semibold text-text">{run.token_count ?? 0}</div>
                </div>
                <div className="rounded-2xl bg-bg-deep/80 p-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-text-dim">Started</div>
                  <div className="mt-2 text-base font-semibold text-text">{formatShortDate(run.started_at)}</div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandedId((current) => (current === run.id ? null : run.id))}
                className="min-h-11 rounded-2xl border border-border bg-bg-deep/80 px-4 text-left text-sm text-text-dim"
              >
                {expandedId === run.id ? "Hide log" : "Show log"}
              </button>

              {expandedId === run.id ? (
                <div className="space-y-3">
                  <pre className="overflow-x-auto whitespace-pre-wrap rounded-2xl border border-border bg-bg-deep p-4 text-xs leading-6 text-text">
                    {run.last_output ?? "No output captured yet."}
                  </pre>
                  {run.error_message ? <div className="text-sm text-red">{run.error_message}</div> : null}
                </div>
              ) : null}
            </Card>
          ))
        ) : (
          <EmptyState label="No sub-agent runs found." />
        )}
      </div>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}

const quickActions = ["Status", "Briefing", "Priority list"];

export function CommandToolScreen() {
  const [message, setMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const { data, error, loading } = usePollingData<{ items: QuickCommand[] }>("/api/tools/commands?limit=10", 5000);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [data?.items]);

  const sendCommand = async (command: string) => {
    if (!command.trim()) return;
    try {
      // Save to DB first
      await fetchJson("/api/tools/commands", {
        method: "POST",
        body: JSON.stringify({
          agent_id: "lumina",
          command: command.trim(),
          status: "sent",
        }),
      });
      setMessage("");

      // FUNC-1: Forward command to OpenClaw gateway as a system event
      const gatewayUrl = process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:18789";
      const gatewayToken = process.env.NEXT_PUBLIC_GATEWAY_TOKEN ?? "";
      if (gatewayToken) {
        try {
          await fetch(`${gatewayUrl}/api/system-event`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${gatewayToken}`,
            },
            body: JSON.stringify({ text: command.trim(), mode: "now" }),
          });
          toast.success("Command sent to Lumina");
        } catch {
          toast("Command saved — gateway unreachable", { icon: "⚠️" });
        }
      } else {
        toast.success("Command saved");
      }

      window.location.reload();
    } catch (sendError) {
      toast.error(sendError instanceof Error ? sendError.message : 'Send failed');
    }
  };

  if (loading && !data) return <LoadingState label="Loading quick command" />;

  return (
    <div className="flex min-h-[calc(100vh-110px)] flex-col gap-4 pb-24">
      <ShellHeader
        title="Quick Command"
        subtitle="Direct command dispatch into Arkon with chat-style history, quick actions, and a sticky input bar."
      />

      <Card className="flex-1 overflow-hidden p-0">
        <div ref={scrollRef} className="flex max-h-[58vh] min-h-[50vh] flex-col gap-3 overflow-y-auto p-4">
          {data?.items.length ? (
            data.items.map((entry) => (
              <div key={entry.id} className="space-y-2">
                <div className="ml-auto max-w-[85%] rounded-[22px] rounded-br-md bg-cyan px-4 py-3 text-sm font-medium text-bg-deep">
                  {entry.command}
                </div>
                <div className="max-w-[88%] rounded-[22px] rounded-bl-md border border-border bg-bg-deep/80 px-4 py-3 text-sm text-text">
                  {entry.response ?? "Awaiting response from Lumina."}
                </div>
                <div className="flex items-center gap-2 text-[11px] text-text-dim">
                  <Badge tone={entry.status === "completed" ? "green" : entry.status === "processing" ? "amber" : "slate"}>
                    {entry.status}
                  </Badge>
                  <span>{timeAgo(entry.created_at)}</span>
                </div>
              </div>
            ))
          ) : (
            <EmptyState label="No recent commands yet." />
          )}
        </div>
      </Card>

      <div className="fixed inset-x-0 bottom-[72px] z-40 mx-auto w-full max-w-3xl px-4 sm:px-6">
        <div className="rounded-[24px] border border-border bg-bg-card/95 p-3 shadow-[0_18px_48px_rgba(0,0,0,0.4)] backdrop-blur">
          <div className="mb-3 flex gap-2 overflow-x-auto">
            {quickActions.map((action) => (
              <button
                key={action}
                type="button"
                onClick={() => {
                  setMessage(action);
                  void sendCommand(action);
                }}
                className="min-h-11 rounded-full border border-border bg-bg-deep/80 px-4 text-sm text-text-dim"
              >
                {action}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-3">
            <textarea
              rows={1}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Send a command to Lumina"
              className="min-h-11 flex-1 resize-none rounded-2xl border border-border bg-bg-deep/80 px-4 py-3 text-sm text-text outline-none"
            />
            <button
              type="button"
              onClick={() => void sendCommand(message)}
              className="min-h-11 rounded-2xl border border-cyan/30 bg-cyan px-5 text-sm font-semibold text-bg-deep"
            >
              Send
            </button>
          </div>
        </div>
      </div>

      {error ? <ErrorState error={error} /> : null}
    </div>
  );
}
