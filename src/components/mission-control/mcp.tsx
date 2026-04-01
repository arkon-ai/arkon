"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { ShellHeader, Card } from "./dashboard";
import { SkeletonCard } from "./charts";

/* ─── Registry Types ─────────────────────────────────────── */
type RegistryEntry = {
  server: {
    name: string;
    title?: string;
    description?: string;
    websiteUrl?: string;
    version?: string;
    repository?: { url?: string };
    remotes?: Array<{ type: string; url: string }>;
    packages?: Array<{ registryType: string; transport?: { type: string } }>;
  };
  _meta?: Record<string, unknown>;
  _imported?: boolean;
};

/* ─── Registry Browser ───────────────────────────────────── */
function RegistryBrowser({ onImported }: { onImported: () => void }) {
  const [results, setResults] = useState<RegistryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function getHeaders(): Record<string, string> {
    const token = typeof document !== "undefined"
      ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "")
      : "";
    const csrf = typeof document !== "undefined"
      ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "") : "";
    return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(csrf ? { "x-csrf-token": csrf } : {}) };
  }

  const search = useCallback(async (q: string) => {
    setLoading(true);
    setSelected(new Set());
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (q.trim()) params.set("search", q.trim());
      const res = await fetch(`/api/tools/mcp-registry?${params}`, { headers: getHeaders() });
      const data = await res.json() as { servers: RegistryEntry[]; total?: number };
      setResults(data.servers ?? []);
      setTotal(data.total ?? null);
    } catch {
      toast.error("Registry fetch failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void search("");
  }, [search]);

  const handleSearch = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void search(val); }, 400);
  };

  const toggleSelect = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const importSelected = async () => {
    if (selected.size === 0) return;
    setImporting(true);
    const toImport = results.filter(e => selected.has(e.server.name));
    try {
      const res = await fetch("/api/tools/mcp-registry", {
        method: "POST",
        headers: getHeaders(),
        body: JSON.stringify({ servers: toImport }),
      });
      const data = await res.json() as { imported?: number; skipped?: number; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      toast.success(`Imported ${data.imported} server${data.imported !== 1 ? "s" : ""}${data.skipped ? ` (${data.skipped} already existed)` : ""}`);
      setSelected(new Set());
      onImported();
      void search(query);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Search MCP registry… (e.g. notion, slack, github)"
          className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition"
        />
        {selected.size > 0 && (
          <button
            onClick={() => void importSelected()}
            disabled={importing}
            className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition"
          >
            {importing ? "Importing…" : `Import ${selected.size}`}
          </button>
        )}
      </div>

      {total !== null && (
        <p className="text-xs text-[var(--text-secondary)]">
          Showing {results.length} of {total.toLocaleString()} servers in the official MCP Registry
        </p>
      )}

      {loading ? (
        <div className="space-y-2"><SkeletonCard /><SkeletonCard /></div>
      ) : (
        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {results.map((entry) => {
            const s = entry.server;
            const name = s.title ?? s.name;
            const isSelected = selected.has(s.name);
            const isImported = entry._imported;
            const transportType = s.remotes?.[0]?.type ?? s.packages?.[0]?.transport?.type ?? "stdio";

            return (
              <motion.div
                key={`${s.name}-${s.version}`}
                layout
                onClick={() => !isImported && toggleSelect(s.name)}
                className={`cursor-pointer rounded-xl border px-4 py-3 transition ${
                  isImported
                    ? "border-[var(--border)]/50 bg-[var(--bg-primary)]/40 opacity-60 cursor-default"
                    : isSelected
                    ? "border-[var(--accent)]/60 bg-[rgba(0,212,126,0.08)]"
                    : "border-[var(--border)] bg-[var(--bg-primary)]/60 hover:border-[var(--border)]/80"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-[var(--text-primary)] truncate">{name}</span>
                      <span className="rounded-full border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                        {transportType.toUpperCase()}
                      </span>
                      {s.version && (
                        <span className="text-[10px] text-[var(--text-tertiary)]">v{s.version}</span>
                      )}
                      {isImported && (
                        <span className="rounded-full bg-[var(--accent)]/20 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                          ✓ Added
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)] line-clamp-2">{s.description}</p>
                    )}
                  </div>
                  {!isImported && (
                    <div className={`mt-1 h-5 w-5 shrink-0 rounded-full border-2 transition ${isSelected ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--border)]"}`}>
                      {isSelected && <div className="flex h-full items-center justify-center text-[var(--accent-foreground)] text-[10px] font-bold">✓</div>}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
          {results.length === 0 && !loading && (
            <p className="py-8 text-center text-sm text-[var(--text-secondary)]">No servers found for &quot;{query}&quot;</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Types ─────────────────────────────────────────────── */
type MCPServer = {
  id: number;
  name: string;
  url: string | null;
  host: string | null;
  port: number | null;
  server_type: string;
  approved: boolean;
  status: "online" | "offline" | "unknown" | null;
  last_checked: string | null;
  notes: string | null;
  created_at: string;
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
function statusDot(status: MCPServer["status"]): { colour: string; label: string; pulse: boolean } {
  if (status === "online") return { colour: "bg-[var(--accent)]", label: "Online", pulse: false };
  if (status === "offline") return { colour: "bg-red-500", label: "Offline", pulse: false };
  return { colour: "bg-[var(--warning)]", label: "Unknown", pulse: true };
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never checked";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/* ─── Add Server Modal ───────────────────────────────────── */
function AddServerModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: "", url: "", server_type: "mcp", approved: false, notes: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!form.name.trim()) { toast.error("Name required"); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/tools/mcp", {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify(form),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("MCP server added");
      onAdded();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-4 text-base font-bold text-[var(--text-primary)]">Add MCP Server</h3>

        <div className="space-y-3">
          {[
            { label: "Name *", key: "name", placeholder: "e.g. Filesystem MCP" },
            { label: "URL / Endpoint", key: "url", placeholder: "e.g. http://localhost:3001" },
            { label: "Notes", key: "notes", placeholder: "Optional context" },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{label}</label>
              <input
                value={form[key as keyof typeof form] as string}
                onChange={(e) => setForm(f => ({ ...f, [key]: e.target.value }))}
                placeholder={placeholder}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition"
              />
            </div>
          ))}

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Type</label>
            <select
              value={form.server_type}
              onChange={(e) => setForm(f => ({ ...f, server_type: e.target.value }))}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {["mcp", "stdio", "sse", "websocket", "http"].map(t => (
                <option key={t} value={t}>{t.toUpperCase()}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.approved}
              onChange={(e) => setForm(f => ({ ...f, approved: e.target.checked }))}
              className="h-4 w-4 rounded"
            />
            <span className="text-sm text-[var(--text-secondary)]">Approved (trusted server)</span>
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:opacity-90 disabled:opacity-50 transition"
          >
            {busy ? "Adding…" : "Add Server"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
            Cancel
          </button>
        </div>
      </motion.div>
    </div>
  );
}


/* ─── Agent Mapping ──────────────────────────────────────── */
function AgentMappingPanel({ serverId, onClose }: { serverId: number; onClose: () => void }) {
  const [mapped, setMapped] = useState<Array<{ agent_id: string; agent_name: string; granted_at: string }>>([]);
  const [allAgents, setAllAgents] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const [mapRes, agentRes] = await Promise.all([
        fetch(`/api/tools/mcp/${serverId}/agents`, { headers: getHeaders() }),
        fetch("/api/admin/agents", { headers: getHeaders() }),
      ]);
      const mapData = await mapRes.json() as { agents: typeof mapped };
      const agentData = await agentRes.json() as { agents: typeof allAgents };
      setMapped(mapData.agents ?? []);
      setAllAgents(agentData.agents ?? []);
    } catch {
      toast.error("Failed to load agent mappings");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  const addAgent = async (agentId: string) => {
    try {
      await fetch(`/api/tools/mcp/${serverId}/agents`, {
        method: "POST",
        headers: getHeaders(true),
        body: JSON.stringify({ agent_ids: [agentId] }),
      });
      await fetchData();
      toast.success("Agent assigned");
    } catch {
      toast.error("Failed to assign agent");
    }
  };

  const removeAgent = async (agentId: string) => {
    try {
      await fetch(`/api/tools/mcp/${serverId}/agents?agent_id=${agentId}`, {
        method: "DELETE",
        headers: getHeaders(true),
      });
      await fetchData();
      toast.success("Agent removed");
    } catch {
      toast.error("Failed to remove agent");
    }
  };

  const mappedIds = new Set(mapped.map(m => m.agent_id));
  const unmapped = allAgents.filter(a => !mappedIds.has(a.id));

  return (
    <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">Assigned Agents</p>
        <button onClick={onClose} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">\u2715</button>
      </div>
      {loading ? (
        <p className="text-xs text-[var(--text-secondary)]">Loading...</p>
      ) : (
        <>
          {mapped.length > 0 ? (
            <div className="space-y-1 mb-2">
              {mapped.map(m => (
                <div key={m.agent_id} className="flex items-center justify-between rounded-lg bg-white/[0.02] px-2 py-1.5">
                  <span className="text-xs text-[var(--text-primary)]">{m.agent_name}</span>
                  <button onClick={() => void removeAgent(m.agent_id)} className="text-[10px] text-red-400 hover:text-red-300">Remove</button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-tertiary)] mb-2">No agents assigned</p>
          )}
          {unmapped.length > 0 && (
            <select
              onChange={(e) => { if (e.target.value) { void addAgent(e.target.value); e.target.value = ""; } }}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
              defaultValue=""
            >
              <option value="" disabled>+ Assign agent...</option>
              {unmapped.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          )}
        </>
      )}
    </div>
  );
}

/* ─── Config Export Modal ────────────────────────────────── */
function ConfigExportModal({ serverId, serverName, onClose }: { serverId: number; serverName: string; onClose: () => void }) {
  const [format, setFormat] = useState<"claude-code" | "cursor" | "raw">("claude-code");
  const [config, setConfig] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState("");

  const fetchConfig = useCallback(async (fmt: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tools/mcp/${serverId}/export?format=${fmt}`, { headers: getHeaders() });
      const data = await res.json() as { config: unknown; instructions: string };
      setConfig(JSON.stringify(data.config, null, 2));
      setInstructions(data.instructions ?? "");
    } catch {
      toast.error("Export failed");
    } finally {
      setLoading(false);
    }
  }, [serverId]);

  useEffect(() => { void fetchConfig(format); }, [format, fetchConfig]);

  const copyToClipboard = () => {
    if (config) {
      navigator.clipboard.writeText(config);
      toast.success("Copied to clipboard");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="w-full max-w-lg rounded-3xl border border-[var(--border)] bg-[var(--bg-primary)] p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-base font-bold text-[var(--text-primary)]">Export Config</h3>
        <p className="mb-4 text-xs text-[var(--text-secondary)]">{serverName}</p>

        <div className="flex gap-2 mb-4">
          {(["claude-code", "cursor", "raw"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                format === f
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                  : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              {f === "claude-code" ? "Claude Code" : f === "cursor" ? "Cursor" : "Raw JSON"}
            </button>
          ))}
        </div>

        {instructions && <p className="mb-2 text-xs text-[var(--accent)]">{instructions}</p>}

        {loading ? (
          <div className="h-32 rounded-xl bg-[var(--bg-primary)] animate-pulse" />
        ) : (
          <pre className="max-h-64 overflow-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 font-mono text-xs text-[var(--accent)]">
            {config}
          </pre>
        )}

        <div className="mt-4 flex gap-2">
          <button
            onClick={copyToClipboard}
            className="flex-1 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] hover:opacity-90 transition"
          >
            Copy to Clipboard
          </button>
          <button onClick={onClose} className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition">
            Close
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── Server Card ────────────────────────────────────────── */
function ServerCard({ server, onUpdated, onDelete }: {
  server: MCPServer;
  onUpdated: () => void;
  onDelete: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [showAgents, setShowAgents] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const dot = statusDot(server.status);

  const runCheck = async () => {
    setChecking(true);
    try {
      await fetch(`/api/tools/mcp?check=1`, { headers: getHeaders() });
      onUpdated();
      toast.success("Health check complete");
    } catch {
      toast.error("Check failed");
    } finally {
      setChecking(false);
    }
  };

  const toggleApproved = async () => {
    try {
      const res = await fetch(`/api/tools/mcp?id=${server.id}`, {
        method: "PATCH",
        headers: getHeaders(true),
        body: JSON.stringify({ approved: !server.approved }),
      });
      if (!res.ok) throw new Error("Failed");
      onUpdated();
    } catch {
      toast.error("Update failed");
    }
  };

  const deleteServer = async () => {
    if (!confirm(`Delete "${server.name}"?`)) return;
    try {
      const res = await fetch(`/api/tools/mcp?id=${server.id}`, {
        method: "DELETE",
        headers: getHeaders(true),
      });
      if (!res.ok) throw new Error("Failed");
      onDelete();
      toast.success("Server removed");
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <motion.div
      layout
      className={`rounded-2xl border px-4 py-4 transition ${
        !server.approved
          ? "border-amber-500/30 bg-[rgba(245,158,11,0.04)]"
          : server.status === "offline"
          ? "border-red-500/30 bg-[rgba(239,68,68,0.04)]"
          : "border-[var(--border)] bg-[var(--bg-primary)]/70"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Status dot */}
        <div className="mt-1 shrink-0">
          <div className={`h-3 w-3 rounded-full ${dot.colour} ${dot.pulse ? "animate-pulse" : ""}`} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{server.name}</span>
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                  {server.server_type.toUpperCase()}
                </span>
                {!server.approved && (
                  <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-400">
                    ⚠ UNAPPROVED
                  </span>
                )}
              </div>
              {server.url && (
                <p className="mt-0.5 text-xs font-mono text-[var(--text-tertiary)] truncate max-w-[260px]">{server.url}</p>
              )}
              <p className="mt-0.5 text-[10px] text-[var(--text-secondary)]">
                {dot.label} · Checked {fmtRelative(server.last_checked)}
              </p>
            </div>
          </div>

          {server.notes && (
            <p className="mt-2 text-xs text-[var(--text-secondary)]">{server.notes}</p>
          )}

          {/* Actions */}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={() => void runCheck()}
              disabled={checking}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition disabled:opacity-50"
            >
              {checking ? "Checking…" : "🔍 Check Now"}
            </button>
            <button
              onClick={() => void toggleApproved()}
              className={`rounded-xl border px-3 py-1.5 text-xs transition ${
                server.approved
                  ? "border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  : "border-[var(--accent)]/30 text-[var(--accent)] hover:bg-[rgba(0,212,126,0.08)]"
              }`}
            >
              {server.approved ? "⚠ Revoke Approval" : "✓ Approve"}
            </button>
            <button
              onClick={() => setShowAgents(!showAgents)}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition"
            >
              👥 Agents
            </button>
            <button
              onClick={() => setShowExport(true)}
              className="rounded-xl border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 transition"
            >
              📋 Export
            </button>
            <button
              onClick={() => void deleteServer()}
              className="rounded-xl border border-red-500/20 px-3 py-1.5 text-xs text-red-400 hover:bg-[rgba(239,68,68,0.08)] transition"
            >
              🗑 Remove
            </button>
          </div>

          {showAgents && <AgentMappingPanel serverId={server.id} onClose={() => setShowAgents(false)} />}

          <AnimatePresence>
            {showExport && <ConfigExportModal serverId={server.id} serverName={server.name} onClose={() => setShowExport(false)} />}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main ───────────────────────────────────────────────── */
export function MCPInventory() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "approved" | "unapproved" | "offline">("all");
  const [view, setView] = useState<"my" | "registry">("my");

  const fetchServers = useCallback(async () => {
    try {
      const res = await fetch("/api/tools/mcp", { headers: getHeaders() });
      const data = await res.json() as { servers: MCPServer[] };
      setServers(data.servers ?? []);
    } catch {
      toast.error("Failed to load MCP servers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchServers(); }, [fetchServers]);

  const runAllChecks = async () => {
    toast("Running health checks…");
    try {
      await fetch("/api/tools/mcp?check=1", { headers: getHeaders() });
      await fetchServers();
      toast.success("All checks complete");
    } catch {
      toast.error("Health check failed");
    }
  };

  const filtered = servers.filter((s) => {
    if (filter === "approved") return s.approved;
    if (filter === "unapproved") return !s.approved;
    if (filter === "offline") return s.status === "offline";
    return true;
  });

  const unapprovedCount = servers.filter(s => !s.approved).length;
  const offlineCount = servers.filter(s => s.status === "offline").length;

  if (loading) return <div className="space-y-4 pb-24"><SkeletonCard /><SkeletonCard /></div>;

  return (
    <div className="space-y-5 pb-24">
      <ShellHeader
        title="MCP Servers"
        subtitle="Model Context Protocol server registry + health monitor"
        action={
          view === "my" ? (
            <div className="flex gap-2">
              <button
                onClick={() => void runAllChecks()}
                className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:text-[var(--accent)] transition"
              >
                🔍 Check All
              </button>
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-xl bg-[var(--accent)] px-3 py-2 text-xs font-semibold text-[var(--accent-foreground)] hover:opacity-90 transition"
              >
                + Add Server
              </button>
            </div>
          ) : null
        }
      />

      {/* View toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => setView("my")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${view === "my" ? "bg-[var(--accent)] text-[var(--accent-foreground)]" : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          🔌 My Servers ({servers.length})
        </button>
        <button
          onClick={() => setView("registry")}
          className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${view === "registry" ? "bg-[var(--accent)] text-white" : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"}`}
        >
          🌐 Browse Registry
        </button>
      </div>

      {/* Registry Browser */}
      {view === "registry" && (
        <Card>
          <div className="space-y-1 mb-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">Official MCP Registry</p>
            <p className="text-xs text-[var(--text-secondary)]">Powered by <span className="text-[var(--accent)]">registry.modelcontextprotocol.io</span> — browse thousands of community-verified servers. Tick any you want → Import.</p>
          </div>
          <RegistryBrowser onImported={fetchServers} />
        </Card>
      )}



      {/* My Servers — unapproved warning */}
      {view === "my" && unapprovedCount > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-[rgba(245,158,11,0.06)] px-4 py-3">
          <p className="text-sm font-semibold text-amber-400">
            ⚠ {unapprovedCount} unapproved MCP server{unapprovedCount > 1 ? "s" : ""} detected
          </p>
          <p className="mt-0.5 text-xs text-amber-400/70">
            Review and approve or remove servers you don't recognise.
          </p>
        </div>
      )}

      {view === "my" && servers.length === 0 && (
        <Card>
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🔌</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">No MCP servers registered</p>
            <p className="mt-2 text-xs text-[var(--text-secondary)]">
              Add servers manually or browse the official registry.
            </p>
            <div className="mt-4 flex justify-center gap-2">
              <button
                onClick={() => setShowAdd(true)}
                className="rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--accent-foreground)]"
              >
                + Add Manually
              </button>
              <button
                onClick={() => setView("registry")}
                className="rounded-xl border border-[var(--accent)]/40 px-4 py-2 text-xs font-semibold text-[var(--accent)]"
              >
                🌐 Browse Registry
              </button>
            </div>
          </div>
        </Card>
      )}

      {view === "my" && servers.length > 0 && (
        <>
          {/* Filter tabs */}
          <div className="flex flex-wrap gap-2">
            {[
              { key: "all", label: `All (${servers.length})` },
              { key: "approved", label: `Approved (${servers.filter(s => s.approved).length})` },
              { key: "unapproved", label: `Unapproved (${unapprovedCount})`, danger: unapprovedCount > 0 },
              { key: "offline", label: `Offline (${offlineCount})`, danger: offlineCount > 0 },
            ].map(({ key, label, danger }) => (
              <button
                key={key}
                onClick={() => setFilter(key as typeof filter)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                  filter === key
                    ? danger ? "bg-amber-500/20 text-amber-400" : "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "border border-[var(--border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {filtered.map((server) => (
              <ServerCard
                key={server.id}
                server={server}
                onUpdated={fetchServers}
                onDelete={fetchServers}
              />
            ))}
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-[var(--text-secondary)]">No servers match this filter</div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {showAdd && <AddServerModal onClose={() => setShowAdd(false)} onAdded={fetchServers} />}
      </AnimatePresence>
    </div>
  );
}
