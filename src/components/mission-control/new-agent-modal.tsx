"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
} from "lucide-react";

/**
 * NewAgentModal — provisions a new agent via POST /api/admin/agents.
 *
 * Mirrors KillConfirmModal idiom (phase machine, Tailwind overlay, no lib).
 * Owner-only endpoint — 403 is rendered as an explicit error state.
 * Provisioning token is shown ONCE on success; copy-to-clipboard with
 * 2s "Copied" confirmation. Used by AgentsContent for transformate WI-392 / PR-7.
 *
 * The endpoint accepts:
 *   { id, name, agentRole?, tenant_id, tenant_name? }
 * and returns:
 *   { ok, agentId, token, tenant_id, role }
 */

type Phase = "form" | "submitting" | "success" | "error";

interface TenantOpt {
  id: string;
  name: string;
}

interface ProvisionResult {
  ok: boolean;
  agentId: string;
  token: string;
  tenant_id: string;
  role: string;
}

export function NewAgentModal({
  tenants,
  onClose,
  onSuccess,
}: {
  tenants: TenantOpt[];
  onClose: () => void;
  onSuccess?: (result: ProvisionResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>("form");
  const [rawId, setRawId] = useState("");
  const [name, setName] = useState("");
  const [tenantId, setTenantId] = useState(tenants[0]?.id ?? "");
  const [newTenant, setNewTenant] = useState(false);
  const [newTenantName, setNewTenantName] = useState("");
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus id input on open
  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, []);

  // Escape closes (not while submitting)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && phase !== "submitting") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, phase]);

  // Normalize id to lowercase slug as user types
  const slugId = rawId.toLowerCase().replace(/[^a-z0-9-]/g, "");

  const canSubmit =
    slugId.length > 0 &&
    name.trim().length > 0 &&
    (newTenant ? newTenantName.trim().length > 0 : tenantId.length > 0);

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setPhase("submitting");
    setError(null);

    const body: Record<string, string> = {
      id: slugId,
      name: name.trim(),
      tenant_id: newTenant
        ? newTenantName
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9-]/g, "-")
            .replace(/^-+|-+$/g, "")
        : tenantId,
    };
    if (newTenant) body.tenant_name = newTenantName.trim();

    // CSRF header — matches ackAlert pattern in AlertsBanner / AnomalyWidget.
    // /api/admin/agents POST is owner-only and mints a provisioning token;
    // session-authenticated requests need x-csrf-token. Added per @claude review.
    const csrf =
      typeof document !== "undefined"
        ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "")
        : "";

    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-csrf-token": csrf,
        },
        body: JSON.stringify(body),
      });

      if (res.status === 403) {
        setError(
          "Owner-only — your session doesn't have permission to provision agents."
        );
        setPhase("error");
        return;
      }

      const payload = (await res.json().catch(() => null)) as
        | (ProvisionResult & { error?: string })
        | null;

      if (!res.ok || !payload?.ok) {
        setError(payload?.error || `Provisioning failed (HTTP ${res.status})`);
        setPhase("error");
        return;
      }

      setResult(payload);
      setPhase("success");
      onSuccess?.(payload);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("error");
    }
  }, [canSubmit, slugId, name, tenantId, newTenant, newTenantName, onSuccess]);

  const handleCopyToken = useCallback(() => {
    if (!result) return;
    navigator.clipboard
      .writeText(result.token)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {
        /* clipboard denied — token still visible in code block */
      });
  }, [result]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={phase !== "submitting" ? onClose : undefined}
        role="button"
        aria-label="Close"
        tabIndex={-1}
      />
      <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-overlay)]">
        {phase === "form" && (
          <>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-success/10">
                <Bot className="h-5 w-5 text-success" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                  Register new agent
                </h3>
                <p className="text-[12px] text-[var(--text-secondary)]">
                  A provisioning token will be issued once
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <Field label="Agent ID" hint="lowercase, alphanumeric + hyphens">
                <input
                  ref={inputRef}
                  type="text"
                  value={rawId}
                  onChange={(e) => setRawId(e.target.value)}
                  placeholder="e.g. lumina"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-success/40"
                />
                {rawId && rawId !== slugId ? (
                  <p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">
                    normalized: {slugId || "(empty)"}
                  </p>
                ) : null}
              </Field>

              <Field label="Display name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Lumina"
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-success/40"
                />
              </Field>

              <Field label="Tenant">
                {newTenant ? (
                  <input
                    type="text"
                    value={newTenantName}
                    onChange={(e) => setNewTenantName(e.target.value)}
                    placeholder="New tenant name"
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-success/40"
                  />
                ) : (
                  <select
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none focus:border-success/40"
                  >
                    {tenants.length === 0 ? (
                      <option value="">No tenants available</option>
                    ) : (
                      tenants.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))
                    )}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setNewTenant((v) => !v)}
                  className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                >
                  {newTenant ? "← Use existing tenant" : "+ New tenant"}
                </button>
              </Field>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="rounded-xl border border-success/40 bg-success/20 px-4 py-2 text-[13px] font-semibold text-success transition hover:bg-success/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Provision
              </button>
            </div>
          </>
        )}

        {phase === "submitting" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
              <Loader2 className="h-7 w-7 animate-spin text-success" />
            </div>
            <div className="text-center">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                Provisioning agent…
              </h3>
              <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                Creating record + minting token
              </p>
            </div>
          </div>
        )}

        {phase === "success" && result && (
          <>
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-success/10">
                <CheckCircle2 className="h-7 w-7 text-success" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-success">
                  Agent provisioned
                </h3>
                <p className="mt-1 text-[12px] text-[var(--text-secondary)]">
                  <span className="font-mono">{result.agentId}</span> in tenant{" "}
                  <span className="font-mono">{result.tenant_id}</span>
                </p>
              </div>
            </div>

            <div className="mb-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <div className="text-[12px] text-warning">
                  This provisioning token is shown <b>once</b>. Copy it now — it cannot be retrieved later.
                </div>
              </div>
            </div>

            <div className="mb-4">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                Provisioning token
              </label>
              <div className="flex items-stretch gap-2">
                <code className="flex-1 select-all break-all rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-[11px] text-[var(--text-primary)]">
                  {result.token}
                </code>
                <button
                  type="button"
                  onClick={handleCopyToken}
                  className="flex shrink-0 items-center gap-1.5 rounded-xl border border-[var(--border)] px-3 py-2 text-[12px] text-[var(--text-secondary)] transition hover:bg-[var(--bg-surface-2)] hover:text-[var(--text-primary)]"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-success" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
              >
                Done
              </button>
            </div>
          </>
        )}

        {phase === "error" && (
          <>
            <div className="mb-4 flex flex-col items-center gap-3 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-danger/10">
                <XCircle className="h-7 w-7 text-danger" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-danger">
                  Provisioning failed
                </h3>
                <p className="mt-1 text-[12px] text-[var(--text-tertiary)]">
                  {error}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPhase("form")}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-[var(--border)] px-4 py-2 text-[13px] font-medium text-[var(--text-secondary)] transition hover:bg-white/[0.03] hover:text-[var(--text-primary)]"
              >
                Dismiss
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium text-[var(--text-secondary)]">
        {label}
        {hint ? (
          <span className="ml-2 font-mono text-[10px] text-[var(--text-tertiary)]">
            {hint}
          </span>
        ) : null}
      </label>
      {children}
    </div>
  );
}
