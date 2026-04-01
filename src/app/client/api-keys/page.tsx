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
            <h1 className="text-2xl font-extrabold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              API Keys
            </h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              Manage authentication keys for your agent integrations
            </p>
          </div>
          <button
            type="button"
            onClick={() => { setShowCreate(true); setRawKey(null); setError(""); }}
            className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] active:scale-[0.98]"
          >
            <Plus className="h-4 w-4" />
            Create Key
          </button>
        </div>

        {rawKey && (
          <div className="relative rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--warning)]" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Save your API key now - it will not be shown again
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--accent)] break-all">
                    {rawKey}
                  </code>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                  >
                    {copied ? <Check className="h-4 w-4 text-[var(--success)]" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showCreate && !rawKey && (
          <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 card-hover">
            <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
            <h2 className="text-lg font-bold text-[var(--text-primary)] font-[family-name:var(--font-display)]">
              Create API Key
            </h2>
            <div className="mt-4 space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g., Production Agent Key"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[rgba(0,212,126,0.5)] focus:outline-none"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Permissions</label>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(SCOPE_LABELS).map(([scope, label]) => (
                    <button
                      key={scope}
                      type="button"
                      onClick={() => toggleScope(scope)}
                      className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                        newKeyScopes.includes(scope)
                          ? "bg-[rgba(0,212,126,0.15)] text-[var(--accent)] border border-[rgba(0,212,126,0.3)]"
                          : "bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border)] hover:border-[var(--border-strong)]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">Expires In</label>
                <select
                  value={newKeyExpiry}
                  onChange={(e) => setNewKeyExpiry(Number(e.target.value))}
                  className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2.5 text-sm text-[var(--text-primary)] focus:border-[rgba(0,212,126,0.5)] focus:outline-none"
                >
                  <option value={30}>30 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                  <option value={365}>1 year</option>
                  <option value={0}>No expiry</option>
                </select>
              </div>

              {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={creating || !newKeyName.trim()}
                  className="flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-[var(--accent-foreground)] transition hover:bg-[var(--accent-hover)] disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Key"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
            Active Keys ({activeKeys.length})
          </h2>
          {loading ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center text-sm text-[var(--text-tertiary)]">
              Loading...
            </div>
          ) : activeKeys.length === 0 ? (
            <div className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center card-hover">
              <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
              <Key className="mx-auto mb-3 h-8 w-8 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-secondary)]">No API keys yet</p>
              <p className="mt-1 text-xs text-[var(--text-tertiary)]">Create a key to authenticate your agent integrations</p>
            </div>
          ) : (
            activeKeys.map((k) => (
              <div key={k.id} className="relative rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 card-hover">
                <GlowingEffect spread={40} glow disabled={false} proximity={64} inactiveZone={0.01} borderWidth={2} />
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-[var(--accent)]" />
                      <span className="text-sm font-semibold text-[var(--text-primary)]">{k.name}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-3 text-xs text-[var(--text-tertiary)]">
                      <code className="font-mono text-[var(--text-secondary)]">{k.key_prefix}...****</code>
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
                        <span key={s} className="rounded-md bg-[rgba(0,212,126,0.08)] px-2 py-0.5 text-[10px] font-medium text-[var(--accent)]">
                          {SCOPE_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                    {k.expires_at && (
                      <p className="mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                        {new Date(k.expires_at) < new Date() ? (
                          <span className="text-[var(--danger)]">Expired {formatDate(k.expires_at)}</span>
                        ) : (
                          <>Expires {formatDate(k.expires_at)}</>
                        )}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--danger)]/10 hover:text-[var(--danger)]"
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
            <h2 className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wider">
              Revoked ({revokedKeys.length})
            </h2>
            {revokedKeys.map((k) => (
              <div key={k.id} className="rounded-2xl border border-[var(--border)]/50 bg-[var(--bg-surface)]/50 p-4 opacity-60">
                <div className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-[var(--text-tertiary)]" />
                  <span className="text-sm text-[var(--text-secondary)] line-through">{k.name}</span>
                  <code className="font-mono text-xs text-[var(--text-tertiary)]">{k.key_prefix}...</code>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-2xl border border-[var(--border)]/50 bg-[var(--bg-surface)]/50 p-4">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-[var(--info)]" />
          <div className="text-xs text-[var(--text-secondary)]">
            <p className="font-medium text-[var(--text-primary)]">Security</p>
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
