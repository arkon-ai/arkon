"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Filter, Plus, Search, X } from "lucide-react";

type AgentSlug = string;

interface JournalEntry {
  id: number;
  owner_agent: AgentSlug;
  owner_display_name?: string;
  owner_emoji?: string;
  parent_id: number | null;
  category: string;
  status: string;
  priority: number;
  title: string;
  body_md: string | null;
  links: Array<{ title: string; url: string }>;
  tags: string[];
  related_project: string | null;
  occurred_at: string;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  task: "#3b82f6",
  log: "#64748b",
  decision: "#a855f7",
  insight: "#10b981",
  question: "#eab308",
  blocker: "#ef4444",
  ship: "#22c55e",
  note: "#94a3b8",
};

const STATUS_STYLES: Record<string, { bg: string; color: string }> = {
  todo: { bg: "#1e293b", color: "#93c5fd" },
  in_progress: { bg: "#422006", color: "#fbbf24" },
  done: { bg: "#052e16", color: "#4ade80" },
  blocked: { bg: "#3f0d0d", color: "#fca5a5" },
  cancelled: { bg: "#1f2937", color: "#9ca3af" },
  log: { bg: "#0f172a", color: "#64748b" },
};

async function fetchEntries(params: Record<string, string | undefined>): Promise<JournalEntry[]> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) q.append(k, v);
  }
  const res = await fetch(`/api/journal/entries?${q.toString()}`, { credentials: "include" });
  if (!res.ok) return [];
  const json = await res.json();
  return json.entries ?? [];
}

export function Journal() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<{ status?: string; category?: string; owner?: string; q?: string; project?: string }>({});
  const [view, setView] = useState<"feed" | "kanban">("feed");
  const [showCapture, setShowCapture] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await fetchEntries({ limit: "100", ...filters });
    setEntries(data);
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  // Live stream
  useEffect(() => {
    const es = new EventSource("/api/journal/stream");
    es.onmessage = (e) => {
      try {
        const evt = JSON.parse(e.data);
        if (evt.type === "journal.entry.created") {
          setEntries((prev) => [evt.payload.entry, ...prev]);
        } else if (evt.type === "journal.entry.updated") {
          setEntries((prev) => prev.map((x) => (x.id === evt.payload.entry.id ? evt.payload.entry : x)));
        } else if (evt.type === "journal.entry.deleted") {
          setEntries((prev) => prev.filter((x) => x.id !== evt.payload.entry_id));
        }
      } catch { /* ignore */ }
    };
    es.onerror = () => { /* retry via browser default */ };
    return () => es.close();
  }, []);

  const filteredEntries = useMemo(() => {
    if (!filters.q) return entries;
    const q = filters.q.toLowerCase();
    return entries.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.body_md ?? "").toLowerCase().includes(q) ||
        (e.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }, [entries, filters.q]);

  const distinctOwners = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) s.add(e.owner_agent);
    return [...s].sort();
  }, [entries]);

  const distinctProjects = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) if (e.related_project) s.add(e.related_project);
    return [...s].sort();
  }, [entries]);

  return (
    <div className="min-h-screen text-slate-100" style={{ background: "#0A0A0C" }}>
      <div className="mx-auto max-w-screen-xl px-6 py-8">
        <header className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BookOpen className="h-7 w-7 text-amber-500" />
            <div>
              <h1 className="text-2xl font-semibold">Journal</h1>
              <p className="text-sm text-slate-400">Everything your agents are working on, one feed.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView(view === "feed" ? "kanban" : "feed")}
              className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              {view === "feed" ? "Kanban view" : "Feed view"}
            </button>
            <button
              onClick={() => setShowCapture(true)}
              className="flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-500"
            >
              <Plus className="h-4 w-4" />
              New entry
            </button>
          </div>
        </header>

        <FilterBar filters={filters} setFilters={setFilters} owners={distinctOwners} projects={distinctProjects} />

        {loading ? (
          <div className="py-24 text-center text-slate-500">Loading…</div>
        ) : view === "feed" ? (
          <FeedView entries={filteredEntries} />
        ) : (
          <KanbanView entries={filteredEntries} onMutate={load} />
        )}

        {showCapture && <CaptureModal onClose={() => setShowCapture(false)} onCreated={load} owners={distinctOwners} projects={distinctProjects} />}
      </div>
    </div>
  );
}

function FilterBar({
  filters,
  setFilters,
  owners,
  projects,
}: {
  filters: { status?: string; category?: string; owner?: string; q?: string; project?: string };
  setFilters: (f: typeof filters) => void;
  owners: string[];
  projects: string[];
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search titles, body, tags…"
          value={filters.q ?? ""}
          onChange={(e) => setFilters({ ...filters, q: e.target.value || undefined })}
          className="rounded-md border border-slate-700 bg-slate-900 py-1.5 pl-8 pr-3 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
        />
      </div>
      <Select
        value={filters.owner ?? ""}
        onChange={(v) => setFilters({ ...filters, owner: v || undefined })}
        placeholder="All agents"
        options={[{ v: "", l: "All agents" }, ...owners.map((o) => ({ v: o, l: o }))]}
      />
      <Select
        value={filters.category ?? ""}
        onChange={(v) => setFilters({ ...filters, category: v || undefined })}
        placeholder="All categories"
        options={[
          { v: "", l: "All categories" },
          { v: "task", l: "Task" },
          { v: "log", l: "Log" },
          { v: "decision", l: "Decision" },
          { v: "insight", l: "Insight" },
          { v: "question", l: "Question" },
          { v: "blocker", l: "Blocker" },
          { v: "ship", l: "Ship" },
          { v: "note", l: "Note" },
        ]}
      />
      <Select
        value={filters.status ?? ""}
        onChange={(v) => setFilters({ ...filters, status: v || undefined })}
        placeholder="All statuses"
        options={[
          { v: "", l: "All statuses" },
          { v: "todo", l: "Todo" },
          { v: "in_progress", l: "In progress" },
          { v: "blocked", l: "Blocked" },
          { v: "done", l: "Done" },
        ]}
      />
      <Select
        value={filters.project ?? ""}
        onChange={(v) => setFilters({ ...filters, project: v || undefined })}
        placeholder="All projects"
        options={[{ v: "", l: "All projects" }, ...projects.map((p) => ({ v: p, l: p }))]}
      />
      {(filters.status || filters.category || filters.owner || filters.q || filters.project) && (
        <button
          onClick={() => setFilters({})}
          className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
          Clear
        </button>
      )}
    </div>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ v: string; l: string }>;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.v} value={o.v}>
          {o.l}
        </option>
      ))}
    </select>
  );
}

function FeedView({ entries }: { entries: JournalEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="py-24 text-center text-slate-500">
        No entries match the current filters. Create one with "New entry".
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <EntryRow key={e.id} entry={e} />
      ))}
    </div>
  );
}

function EntryRow({ entry }: { entry: JournalEntry }) {
  const catColor = CATEGORY_COLORS[entry.category] ?? "#64748b";
  const statusStyle = STATUS_STYLES[entry.status] ?? STATUS_STYLES.log;
  return (
    <div className="flex items-start gap-3 rounded-md border border-slate-800 bg-slate-900/40 px-4 py-3 hover:border-slate-700">
      <div
        className="mt-1.5 h-3 w-3 shrink-0 rounded-full"
        style={{ background: catColor }}
        title={entry.category}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="font-mono">{new Date(entry.occurred_at).toLocaleString()}</span>
          <span>·</span>
          <span className="font-medium text-slate-300">
            {entry.owner_emoji ? `${entry.owner_emoji} ` : ""}
            {entry.owner_display_name ?? entry.owner_agent}
          </span>
          <span>·</span>
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            style={{ color: catColor, background: `${catColor}1a` }}
          >
            {entry.category}
          </span>
          {entry.status !== "log" && (
            <span
              className="rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider"
              style={{ color: statusStyle.color, background: statusStyle.bg }}
            >
              {entry.status.replace("_", " ")}
            </span>
          )}
          {entry.related_project && (
            <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              {entry.related_project}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm font-medium text-slate-100">{entry.title}</div>
        {entry.body_md && (
          <div className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{entry.body_md}</div>
        )}
        {entry.tags && entry.tags.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {entry.tags.map((t) => (
              <span key={t} className="rounded-sm bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                #{t}
              </span>
            ))}
          </div>
        )}
        {entry.links && entry.links.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-2 text-xs">
            {entry.links.map((l, i) => (
              <a
                key={i}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-amber-500 hover:underline"
              >
                → {l.title || l.url}
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanView({ entries, onMutate }: { entries: JournalEntry[]; onMutate: () => void }) {
  const columns: Array<{ key: string; label: string }> = [
    { key: "todo", label: "Todo" },
    { key: "in_progress", label: "In progress" },
    { key: "blocked", label: "Blocked" },
    { key: "done", label: "Done" },
  ];
  const tasks = entries.filter((e) => e.category === "task" || e.category === "ship");
  const byStatus = columns.reduce((acc, c) => {
    acc[c.key] = tasks.filter((t) => t.status === c.key);
    return acc;
  }, {} as Record<string, JournalEntry[]>);

  return (
    <div className="grid grid-cols-4 gap-3">
      {columns.map((c) => (
        <div key={c.key} className="rounded-md border border-slate-800 bg-slate-900/40 p-2">
          <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium uppercase tracking-wider text-slate-400">
            {c.label}
            <span className="rounded bg-slate-800 px-1.5 text-slate-500">{byStatus[c.key]?.length ?? 0}</span>
          </div>
          <div className="space-y-2">
            {(byStatus[c.key] ?? []).map((t) => (
              <div key={t.id} className="rounded-md border border-slate-800 bg-slate-900 p-2.5">
                <div className="text-xs text-slate-400">
                  {t.owner_emoji ? `${t.owner_emoji} ` : ""}
                  {t.owner_display_name ?? t.owner_agent}
                </div>
                <div className="mt-1 text-sm text-slate-100">{t.title}</div>
                {t.related_project && (
                  <div className="mt-1 font-mono text-[10px] text-slate-500">{t.related_project}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CaptureModal({
  onClose,
  onCreated,
  owners,
  projects,
}: {
  onClose: () => void;
  onCreated: () => void;
  owners: string[];
  projects: string[];
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("log");
  const [ownerAgent, setOwnerAgent] = useState(owners[0] ?? "brynn");
  const [project, setProject] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/journal/entries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          title: title.trim(),
          body_md: body.trim() || undefined,
          category,
          owner_agent: ownerAgent,
          related_project: project.trim() || undefined,
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          status: category === "task" ? "todo" : "log",
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error ?? `HTTP ${res.status}`);
        setSaving(false);
        return;
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(String(err));
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-8">
      <div className="w-full max-w-xl rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-100">New entry</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300">
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <input
            ref={titleRef}
            type="text"
            required
            placeholder="Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          <textarea
            placeholder="Body (markdown)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={ownerAgent}
              onChange={(e) => setOwnerAgent(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
            >
              {["brynn", "warden", "lumina", "sentinel", "scout", "codesmith", "hermes"].map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-amber-500 focus:outline-none"
            >
              <option value="task">Task</option>
              <option value="log">Log</option>
              <option value="decision">Decision</option>
              <option value="insight">Insight</option>
              <option value="question">Question</option>
              <option value="blocker">Blocker</option>
              <option value="ship">Ship</option>
              <option value="note">Note</option>
            </select>
          </div>
          <input
            type="text"
            placeholder="Related project (optional)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
            list="project-list"
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          <datalist id="project-list">
            {projects.map((p) => (
              <option key={p} value={p} />
            ))}
          </datalist>
          <input
            type="text"
            placeholder="Tags, comma separated"
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none"
          />
          {error && <div className="rounded-md border border-red-800 bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</div>}
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-md bg-amber-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
