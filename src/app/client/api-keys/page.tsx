"use client";

import { useState, useEffect, useCallback } from "react";
import { ClientShell } from "@/components/mission-control/client-shell";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { Key, Plus, Trash2, Copy, Check, AlertTriangle, Clock, Shield } from "lucide-react";

interface ApiKey {
  id: number;
  name: string;
  key_prefix: string;
  scopes: string[];
  tenant_id: string;
  expires_at: string | null;
  last_used_at: string | null;
  is_active: boolean;
  created_at: string;
}

function formatDate(d: string | null) {
  if (!d) return "Never";
  return new Date(d).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function getCsrf(): string {
  const match = document.cookie.match(/mc_csrf=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : "";
}

const SCOPE_LABELS: Record<string, string> = {
  "agents:read": "View Agents",
  "agents:write": "Manage Agents",
  "costs:read": "View Costs",
  "events:read": "View Events",
  "events:write": "Send Events",
  "infra:read": "View Infrastructure",
  "traces:read": "View Traces",
};

export default function ClientApiKeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<string[]>(["agents:read", "costs:read", "events:read"]);
  const [newKeyExpiry, setNewKeyExpiry] = useState<number>(90);
  const [creating, setCreating] = useState(false);
  const [rawKey, setRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const fetchKeys = useCallback(async () => {
    try {
      const res = await fetch("/api/client/api-keys", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setKeys(data.keys ?? []);
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  async function handleCreate() {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError("");

    try {
      const res = await fetch("/api/client/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrf() },
        body: JSON.stringify({
          name: newKeyName.trim(),
          scopes: newKeyScopes,
          expires_in_days: newKeyExpiry || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) { setError(data.error); setCreating(false); return; }

      setRawKey(data.key.raw_key);
      setNewKeyName("");
      setNewKeyScopes(["agents:read", "costs:read", "events:read"]);
      setNewKeyExpiry(90);
      fetchKeys();
    } catch {
      setError("Failed to create key");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: number) {
    if (!confirm("Revoke this API key? This cannot be undone.")) return;
    try {
      await fetch("/api/client/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", "x-csrf-token": getCsrf() },
        body: JSON.stringify({ id }),
      });
      fetchKeys();
    } catch { /* silent */ }
  }

  function handleCopy() {
    if (!rawKey) return;
    navigator.clipboard.writeText(rawKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function toggleScope(scope: string) {
    setNewKeyScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  }

  const activeKeys = keys.filter((k) => k.is_active);
  const revokedKeys = keys.filter((k) => !k.is_active);

  return (
    <ClientShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-[#E4E4ED] font-[family-name:var(--font-display)]">
              API Keys
            </h1>
            <p className="mt-1 text-sm text-[#8888A0]">
              Manage authentication keys for your agent integrations
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowCreate(true); setRawKey(null); setError(""); }}
            className="flex items-center gap-2 rounded-xl bg-[#00D47E] px-4 py-2.5 text-sm font-semibold text-[#0A0A0C] transition hover:bg-[#00E88A] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Create Key
          </button>
        </div>

        {rawKey && (
          <div className="relative rounded-2xl border border-[#00D47E]/30 bg-[#00D47E]/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#F59E0B]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#E4E4ED]">
                  Save your API key now - it will not be shown again
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-[#0A0A0C] px-3 py-2 font-mono text-xs text-[#00D47E] break-all">
                    {rawKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#1E1E2A] bg-[#111118] text-[#8888A0] transition hover:text-[#E4E4ED]"
                  >
                    {copied ? <Check className="h-4 w-4 text-[#10B981]" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreate && !rawKey && (
          <div className="relative rounded-2xl border border-[#1E1E2A] bg-[#111118] p-6 card-hover">
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <h2 className="text-lg font-bold text-[#E4E4ED] font-[family-name:var(--font-display)]">
              Create API Key
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#8888A0] uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production Agent Key"
                  className="w-full rounded-xl border border-[#1E1E2A] bg-[#0A0A0C] px-4 py-2.5 text-sm text-[#E4E4ED] placeholder:text-[#555566] focus:border-[rgba(0,212,126,0.5)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#8888A0] uppercase tracking-wider">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        newKeyScopes.includes(scope)
                          ? "bg-[rgba(0,212,126,0.15)] text-[#00D47E] border border-[rgba(0,212,126,0.3)]"
                          : "bg-[#0A0A0C] text-[#8888A0] border border-[#1E1E2A] hover:border-[#2E2E3A]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[#8888A0] uppercase tracking-wider">Expires In</label>
                <select
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(Number(e.target.value))}
                  className="rounded-xl border border-[#1E1E2A] bg-[#0A0A0C] px-4 py-2.5 text-sm text-[#E4E4ED] focus:border-[rgba(0,212,126,0.5)] focus:outline-none"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                  <option value={0}>No expiry</option>
                </select>
              </div>

              {error && <p className="text-sm text-[#EF4444]">{error}</p>}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newKeyName.trim()}
                  className="flex items-center gap-2 rounded-xl bg-[#00D47E] px-4 py-2.5 text-sm font-semibold text-[#0A0A0C] transition hover:bg-[#00E88A] disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Key"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-[#8888A0] transition hover:text-[#E4E4ED]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[#8888A0] uppercase tracking-wider">
            Active Keys ({activeKeys.length})
          </h2>
          {loading ? (
            <div className="rounded-2xl border border-[#1E1E2A] bg-[#111118] p-8 text-center text-sm text-[#555566]">
              Loading...
            </div>
          ) : activeKeys.length === 0 ? (
            <div className="relative rounded-2xl border border-[#1E1E2A] bg-[#111118] p-8 text-center card-hover">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <Key className="mx-auto mb-3 h-8 w-8 text-[#555566]" />
              <p className="text-sm text-[#8888A0]">No API keys yet</p>
              <p className="mt-1 text-xs text-[#555566]">Create a key to authenticate your agent integrations</p>
            </div>
          ) : (
            activeKeys.map((k) => (
              <div key={k.id} className="relative rounded-2xl border border-[#1E1E2A] bg-[#111118] p-4 card-hover">
                <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-[#00D47E]" />
                      <span className="text-sm font-semibold text-[#E4E4ED]">{k.name}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-[#555566]">
                      <code className="font-mono text-[#8888A0]">{k.key_prefix}...****</code>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Created {formatDate(k.created_at)}
                      </span>
                      {k.last_used_at && (
                        <span>Last used {formatDate(k.last_used_at)}</span>
                      )}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {k.scopes.map((s) => (
                        <span key={s} className="rounded-md bg-[rgba(0,212,126,0.08)] px-2 py-0.5 text-[10px] font-medium text-[#00D47E]">
                          {SCOPE_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                    {k.expires_at && (
                      <p className="mt-1.5 text-[10px] text-[#555566]">
                        {new Date(k.expires_at) < new Date() ? (
                          <span className="text-[#EF4444]">Expired {formatDate(k.expires_at)}</span>
                        ) : (
                          <>Expires {formatDate(k.expires_at)}</>
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[#555566] transition hover:bg-[#EF4444]/10 hover:text-[#EF4444]"
                    title="Revoke key"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {revokedKeys.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-[#555566] uppercase tracking-wider">
              Revoked ({revokedKeys.length})
            </h2>
            {revokedKeys.map((k) => (
              <div key={k.id} className="rounded-2xl border border-[#1E1E2A]/50 bg-[#111118]/50 p-4 opacity-60">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-[#555566]" />
                  <span className="text-sm text-[#8888A0] line-through">{k.name}</span>
                  <code className="font-mono text-xs text-[#555566]">{k.key_prefix}...</code>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-[#1E1E2A]/50 bg-[#111118]/50 p-4">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[#06B6D4]" />
          <div className="text-xs text-[#8888A0]">
            <p className="font-medium text-[#E4E4ED]">Security</p>
            <p className="mt-0.5">
              API keys are hashed and cannot be retrieved after creation. Keys authenticate via
              the Authorization: Bearer header.
              Rotate keys regularly and revoke any that may be compromised.
            </p>
          </div>
        </div>
      </div>
    </ClientShell>
  );
}
