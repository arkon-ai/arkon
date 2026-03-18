"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Shield, AlertTriangle } from "lucide-react";
import { EmptyCard } from "./ui-cards";
import { SectionDescription } from "./dashboard-clarity";

const C = {
  green: "#00D47E", secondary: "#64748b", amber: "#f59e0b",
  red: "#ef4444", slate: "#64748b",
};

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
  const res = await fetch(url, {
    credentials: "include",
    headers: { "x-csrf-token": csrf, ...(opts?.headers || {}) },
    ...opts,
  });
  if (res.status === 401) { window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

/* ── Interfaces ── */
interface AuditEntry {
  id: number; actor: string; action: string; resource_type: string;
  resource_id: string | null; detail: Record<string, unknown>;
  ip_address: string | null; tenant_id: string; created_at: string;
}
interface AuditData {
  entries: AuditEntry[]; total: number; limit: number; offset: number;
  filters: { actions: string[]; resourceTypes: string[] };
}

/* ── Main Component ── */
export function ComplianceDashboard() {
  const [tab, setTab] = useState<"audit" | "export" | "purge">("audit");

  return (
    <div className="space-y-6">
      <SectionDescription id="compliance">
        Review every action taken in your Arkon instance. Export data for compliance reporting
        or use GDPR purge to permanently delete user data and associated events.
      </SectionDescription>

      <div className="flex gap-2">
        {([
          ["audit", "Audit Log"],
          ["export", "Data Export"],
          ["purge", "GDPR Purge"],
        ] as const).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition ${
              tab === t ? "bg-[rgba(0,212,126,0.15)] text-[#00D47E]" : "text-slate-400 hover:text-white"
            }`}
          >{label}</button>
        ))}
      </div>

      {tab === "audit" && <AuditLogTab />}
      {tab === "export" && <ExportTab />}
      {tab === "purge" && <PurgeTab />}
    </div>
  );
}

/* ── Audit Log Tab ── */
function AuditLogTab() {
  const [data, setData] = useState<AuditData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [actionFilter, setActionFilter] = useState("");
  const [resourceFilter, setResourceFilter] = useState("");
  const limit = 25;

  useEffect(() => {
    let mounted = true;
    setError(null);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (actionFilter) params.set("action", actionFilter);
    if (resourceFilter) params.set("resource_type", resourceFilter);

    apiFetch<AuditData>(`/api/compliance/audit-log?${params}`)
      .then((d) => { if (mounted) setData(d); })
      .catch((e) => { if (mounted) setError(e.message); });
    return () => { mounted = false; };
  }, [offset, actionFilter, resourceFilter]);

  if (error) {
    return <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6">
      <p className="text-red-400">Failed to load audit log: {error}</p>
    </div>;
  }

  if (!data) {
    return <div className="space-y-2">{[1, 2, 3].map((i) => (
      <div key={i} className="h-12 animate-pulse rounded-xl bg-[#0d0d1a]" />
    ))}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Quick filters */}
      <div className="flex flex-wrap gap-2">
        {(["", "agent.kill", "agent.pause", "agent.resume"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => { setActionFilter(f); setOffset(0); }}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              actionFilter === f
                ? f === "agent.kill"
                  ? "bg-red-500/15 text-red-400"
                  : "bg-[rgba(0,212,126,0.15)] text-[#00D47E]"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            {f === "" ? "All" : f === "agent.kill" ? "Kills" : f === "agent.pause" ? "Pauses" : "Resumes"}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setOffset(0); }}
          className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-sm text-white">
          <option value="">All Actions</option>
          {data.filters.actions.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={resourceFilter} onChange={(e) => { setResourceFilter(e.target.value); setOffset(0); }}
          className="rounded-xl border border-[#1a2a4a] bg-[#0d0d1a] px-3 py-2 text-sm text-white">
          <option value="">All Resources</option>
          {data.filters.resourceTypes.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <span className="flex items-center text-xs text-slate-500">{data.total} entries</span>
      </div>

      {/* Log entries */}
      {data.entries.length === 0 ? (
        <EmptyCard
          icon={Shield}
          title="No Audit Log Entries"
          description="Actions are automatically logged as you and your agents interact with the system. Recent activity will appear here."
        />
      ) : (
        <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[#1a2a4a] text-xs uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Resource</th>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Tenant</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((e) => (
                <tr key={e.id} className="border-b border-[#1a2a4a]/50 text-slate-300 hover:bg-white/[0.02]">
                  <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(e.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-white">{e.actor}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                      e.action === "agent.kill" ? "bg-red-500/15 text-red-400 font-semibold" :
                      e.action === "agent.pause" ? "bg-amber-500/15 text-amber-400" :
                      e.action === "agent.resume" ? "bg-green-500/15 text-green-400" :
                      e.action.includes("delete") || e.action.includes("purge") ? "bg-red-500/10 text-red-400" :
                      e.action.includes("create") ? "bg-[rgba(0,212,126,0.1)] text-[#00D47E]" :
                      "bg-[#1a2a4a] text-slate-300"
                    }`}>{e.action}</span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{e.resource_type}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 font-mono">{e.resource_id ?? "-"}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500">{e.tenant_id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {data.total > limit && (
        <div className="flex items-center justify-between">
          <button type="button" disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >Previous</button>
          <span className="text-xs text-slate-500">
            {offset + 1}–{Math.min(offset + limit, data.total)} of {data.total}
          </span>
          <button type="button" disabled={offset + limit >= data.total}
            onClick={() => setOffset(offset + limit)}
            className="rounded-xl px-4 py-2 text-sm text-slate-400 hover:text-white disabled:opacity-30"
          >Next</button>
        </div>
      )}
    </div>
  );
}

/* ── Export Tab ── */
function ExportTab() {
  const [dataType, setDataType] = useState("events");
  const [format, setFormat] = useState("json");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; url?: string } | null>(null);

  const handleExport = async () => {
    setLoading(true);
    setResult(null);
    try {
      const params = new URLSearchParams({ type: dataType, format });
      if (since) params.set("since", since);
      if (until) params.set("until", until);

      if (format === "csv") {
        const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
        const res = await fetch(`/api/compliance/export?${params}`, {
          credentials: "include",
          headers: { "x-csrf-token": csrf },
        });
        if (!res.ok) throw new Error(`${res.status}`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${dataType}_export_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        setResult({ count: -1 });
      } else {
        const data = await apiFetch<{ count: number }>(`/api/compliance/export?${params}`);
        setResult({ count: data.count });
      }
    } catch (e) {
      setResult(null);
      alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#1a2a4a] bg-[#0d0d1a] p-6 space-y-4">
        <h3 className="text-sm font-semibold text-slate-300">Export Data</h3>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Data Type</label>
            <select value={dataType} onChange={(e) => setDataType(e.target.value)}
              className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-3 py-2 text-sm text-white">
              <option value="events">Events</option>
              <option value="costs">Costs (daily_stats)</option>
              <option value="agents">Agents</option>
              <option value="audit_log">Audit Log</option>
              <option value="benchmarks">Benchmarks</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Format</label>
            <select value={format} onChange={(e) => setFormat(e.target.value)}
              className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-3 py-2 text-sm text-white">
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Since</label>
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)}
              className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Until</label>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)}
              className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-3 py-2 text-sm text-white" />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button type="button" onClick={handleExport} disabled={loading}
            className="rounded-xl bg-[#00D47E] px-6 py-2.5 text-sm font-semibold text-[#050510] transition hover:brightness-110 disabled:opacity-50">
            {loading ? "Exporting..." : "Export"}
          </button>
          {result && (
            <span className="text-sm text-[#00D47E]">
              {result.count === -1 ? "CSV downloaded" : `Exported ${result.count} rows`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Purge Tab ── */
function PurgeTab() {
  const [scope, setScope] = useState<"tenant" | "agent">("tenant");
  const [scopeId, setScopeId] = useState("");
  const [dryRun, setDryRun] = useState(true);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    dry_run: boolean;
    rows_affected: Record<string, number>;
    purged_at: string | null;
  } | null>(null);
  const [confirmText, setConfirmText] = useState("");

  const handlePurge = async () => {
    if (!dryRun && confirmText !== "PURGE") {
      alert("Type PURGE to confirm destructive operation");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const csrf = document.cookie.match(/mc_csrf=([^;]+)/)?.[1] || "";
      const res = await fetch("/api/compliance/purge", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json", "x-csrf-token": csrf },
        body: JSON.stringify({ scope, scope_id: scopeId, confirm: true, dry_run: dryRun }),
      });
      if (res.status === 401) { window.location.href = "/login"; return; }
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Purge failed");
      setResult(data);
    } catch (e) {
      alert(`Purge failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-red-500/20 bg-[#0d0d1a] p-6 space-y-4">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <h3 className="text-sm font-semibold text-red-400">GDPR Data Purge</h3>
        </div>
        <p className="text-sm text-slate-400">
          Permanently delete all data for a tenant or agent. Use dry run first to preview affected rows.
        </p>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Scope</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as "tenant" | "agent")}
              className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-3 py-2 text-sm text-white">
              <option value="tenant">Tenant</option>
              <option value="agent">Agent</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">{scope === "tenant" ? "Tenant ID" : "Agent ID"}</label>
            <input type="text" value={scopeId} onChange={(e) => setScopeId(e.target.value)}
              placeholder={scope === "tenant" ? "e.g. my-client" : "e.g. agent_abc123"}
              className="w-full rounded-xl border border-[#1a2a4a] bg-[#050510] px-3 py-2 text-sm text-white" />
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input type="checkbox" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)}
                className="rounded border-[#1a2a4a]" />
              Dry Run (preview only)
            </label>
          </div>
        </div>

        {!dryRun && (
          <div>
            <label className="block text-xs text-red-400 mb-1">Type PURGE to confirm</label>
            <input type="text" value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
              className="w-48 rounded-xl border border-red-500/30 bg-[#050510] px-3 py-2 text-sm text-white" />
          </div>
        )}

        <button type="button" onClick={handlePurge} disabled={loading || !scopeId}
          className={`rounded-xl px-6 py-2.5 text-sm font-semibold transition ${
            dryRun
              ? "bg-amber-500 text-[#050510] hover:brightness-110"
              : "bg-red-500 text-white hover:brightness-110"
          } disabled:opacity-50`}
        >
          {loading ? "Processing..." : dryRun ? "Preview Purge" : "Execute Purge"}
        </button>

        {result && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className={`rounded-xl border p-4 text-sm ${
              result.dry_run ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"
            }`}
          >
            <p className={`font-semibold ${result.dry_run ? "text-amber-400" : "text-red-400"}`}>
              {result.dry_run ? "Dry Run Preview" : "Purge Complete"}
            </p>
            <div className="mt-2 space-y-1 text-slate-300">
              {Object.entries(result.rows_affected).map(([table, count]) => (
                <div key={table} className="flex justify-between">
                  <span className="text-slate-500">{table}</span>
                  <span>{count} rows</span>
                </div>
              ))}
            </div>
            {result.purged_at && (
              <p className="mt-2 text-xs text-slate-500">Purged at: {String(result.purged_at)}</p>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
