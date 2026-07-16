"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, Plus, UserRound, X } from "lucide-react";
import { PageHeader } from "./ui-cards";
import {
  AGENT_SLUGS,
  buildManifest,
  manifestsEqual,
  previewProvision,
  submitProvision,
  validateEmail,
  type AgentSlug,
  type PreviewResponse,
  type ProvisionFormState,
  type ProvisionManifest,
  type SubmitResponse,
  type TenantRoleRow,
} from "@/lib/provision-manifest";

function initialFormState(): ProvisionFormState {
  return {
    email: "",
    displayName: "",
    mentionHandle: "",
    helmEnabled: true,
    helmRows: [{ tenant: "", role: "member" }],
    arkonosEnabled: true,
    arkonosRows: [{ tenant: "", role: "user" }],
    arkonEnabled: false,
    arkonRows: [{ tenant: "", role: "member" }],
    agents: {
      warden: false,
      codesmith: false,
      dunamis: false,
      sentinel: false,
      lumina: false,
    },
    channelsEnabled: false,
    channelSlugs: [],
    identityExpanded: false,
    identityRole: "agent",
  };
}

function SectionCard({
  title,
  enabled,
  onToggle,
  children,
}: {
  title: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="ak-card">
      <div className="ak-card__head">
        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onToggle(event.target.checked)}
            className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
          />
          <h3>{title}</h3>
        </label>
      </div>
      {enabled ? <div className="ak-card__body">{children}</div> : null}
    </section>
  );
}

function TenantRoleEditor({
  rows,
  roleOptions,
  onChange,
}: {
  rows: TenantRoleRow[];
  roleOptions: Array<{ value: string; label: string }>;
  onChange: (rows: TenantRoleRow[]) => void;
}) {
  return (
    <div className="space-y-3">
      {rows.map((row, index) => (
        <div key={`row-${index}`} className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <label className="ak-field">
            <span className="ak-label">Tenant</span>
            <input
              className="ak-input"
              value={row.tenant}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...next[index], tenant: event.target.value };
                onChange(next);
              }}
              placeholder="tenant slug"
            />
          </label>
          <label className="ak-field">
            <span className="ak-label">Role</span>
            <select
              className="ak-input"
              value={row.role}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...next[index], role: event.target.value };
                onChange(next);
              }}
            >
              {roleOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              className="ak-btn ak-btn--ghost"
              disabled={rows.length === 1}
              onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}
            >
              Remove
            </button>
          </div>
        </div>
      ))}
      <button
        type="button"
        className="ak-btn"
        onClick={() => onChange([...rows, { tenant: "", role: roleOptions[0]?.value ?? "member" }])}
      >
        <Plus className="h-3.5 w-3.5" />
        Add tenant
      </button>
    </div>
  );
}

function TierPill({ tier }: { tier: PreviewResponse["tier"] }) {
  if (tier === "auto") {
    return (
      <span className="ak-pill ak-pill--ok">
        <span className="dot" />
        Auto
      </span>
    );
  }
  return (
    <span className="ak-pill ak-pill--warm">
      <span className="dot" />
      Hot
    </span>
  );
}

export function ProvisionHumanScreen() {
  const [form, setForm] = useState<ProvisionFormState>(initialFormState);
  const [channelInput, setChannelInput] = useState("");
  const [screen, setScreen] = useState<"form" | "review">("form");
  const [previewBusy, setPreviewBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [previewedManifest, setPreviewedManifest] = useState<ProvisionManifest | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewResponse | null>(null);
  const [submitResult, setSubmitResult] = useState<SubmitResponse | null>(null);
  const submitInFlight = useRef(false);

  const currentManifest = useMemo(() => buildManifest(form), [form]);
  const reviewValid =
    previewedManifest !== null &&
    previewResult !== null &&
    manifestsEqual(currentManifest, previewedManifest);

  const anyAgentChecked = AGENT_SLUGS.some((slug) => form.agents[slug]);
  const showIdentity = anyAgentChecked || form.identityExpanded;

  const updateForm = (patch: Partial<ProvisionFormState>) => {
    setForm((current) => ({ ...current, ...patch }));
    setSubmitResult(null);
  };

  const toggleAgent = (slug: AgentSlug, checked: boolean) => {
    setForm((current) => ({
      ...current,
      agents: { ...current.agents, [slug]: checked },
    }));
    setSubmitResult(null);
  };

  const addChannel = () => {
    const slug = channelInput.trim();
    if (!slug) return;
    if (form.channelSlugs.includes(slug)) {
      toast.error("Channel already added");
      return;
    }
    updateForm({ channelSlugs: [...form.channelSlugs, slug] });
    setChannelInput("");
  };

  const handlePreview = async () => {
    if (previewBusy || submitBusy) return;
    if (!validateEmail(form.email)) {
      toast.error("Enter a valid email address");
      return;
    }
    if (!form.displayName.trim() || !form.mentionHandle.trim()) {
      toast.error("Display name and mention handle are required");
      return;
    }

    const manifest = buildManifest(form);
    setPreviewBusy(true);
    try {
      const result = await previewProvision(manifest);
      setPreviewedManifest(manifest);
      setPreviewResult(result);
      setSubmitResult(null);
      setScreen("review");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Preview failed");
    } finally {
      setPreviewBusy(false);
    }
  };

  const handleSubmit = async () => {
    if (!previewedManifest || !reviewValid) {
      toast.error("Re-preview the plan before submitting");
      return;
    }
    // Synchronous single-flight guard: React state lags a frame, so a double-click
    // could fire two submits before `submitBusy` disables the button.
    if (submitInFlight.current || submitBusy) return;

    submitInFlight.current = true;
    setSubmitBusy(true);
    try {
      const result = await submitProvision(previewedManifest);
      setSubmitResult(result);
      toast.success("Provision request submitted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submit failed");
    } finally {
      submitInFlight.current = false;
      setSubmitBusy(false);
    }
  };

  if (screen === "review" && previewResult && previewedManifest) {
    return (
      <div className="space-y-5 pb-24">
        <PageHeader
          title="Review plan"
          subtitle="Confirm the computed provisioning steps before submission."
          crumbs={["Arkon", "Provision", "Review plan"]}
          action={
            <button
              type="button"
              className="ak-btn"
              onClick={() => {
                setScreen("form");
                setSubmitResult(null);
              }}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to form
            </button>
          }
        />

        <section className="ak-card">
          <div className="ak-card__head">
            <h3>Computed tier</h3>
            <div className="meta">
              <TierPill tier={previewResult.tier} />
            </div>
          </div>
          <div className="ak-card__body space-y-4">
            {previewResult.requiresDoubleT ? (
              <div className="flex items-start gap-3 rounded-[var(--radius-md)] border border-[rgba(var(--warning-rgb),0.35)] bg-[rgba(var(--warning-rgb),0.08)] p-4 text-sm text-[var(--warning)]">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <p>This plan requires Brynn&apos;s two-click Double-T approval before execution.</p>
              </div>
            ) : null}

            {previewResult.converged ? (
              <div className="rounded-[var(--radius-md)] border border-[rgba(var(--success-rgb),0.35)] bg-[rgba(var(--success-rgb),0.08)] p-4 text-sm text-[var(--success)]">
                Zero steps — system already matches.
              </div>
            ) : null}

            {!reviewValid ? (
              <div className="rounded-[var(--radius-md)] border border-[rgba(var(--warning-rgb),0.35)] bg-[rgba(var(--warning-rgb),0.08)] p-4 text-sm text-[var(--warning)]">
                The form changed after preview. Re-preview before submitting.
              </div>
            ) : null}

            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)]">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-[var(--border)] bg-[var(--bg-surface-2)]">
                  <tr>
                    <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                      System
                    </th>
                    <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                      Tenant
                    </th>
                    <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                      Action
                    </th>
                    <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--text-tertiary)]">
                      Detail
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {previewResult.steps.map((step, index) => (
                    <tr key={`${step.system}-${step.tenant}-${step.action}-${index}`} className="border-b border-[var(--border)] last:border-b-0">
                      <td className="px-4 py-3 font-mono tabular-nums text-[var(--text-primary)]">{step.system}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-[var(--text-primary)]">{step.tenant}</td>
                      <td className="px-4 py-3 font-mono tabular-nums text-[var(--text-primary)]">{step.action}</td>
                      <td className="px-4 py-3 text-[var(--text-secondary)]">{step.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                className="ak-btn ak-btn--primary"
                disabled={!reviewValid || submitBusy || submitResult !== null}
                onClick={() => void handleSubmit()}
              >
                {submitBusy ? "Submitting..." : "Submit"}
              </button>
              <button
                type="button"
                className="ak-btn"
                disabled={previewBusy || submitBusy}
                onClick={() => void handlePreview()}
              >
                {previewBusy ? "Re-previewing..." : "Re-preview"}
              </button>
            </div>

            {submitResult ? (
              <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-surface-2)] p-4 text-sm text-[var(--text-secondary)]">
                {submitResult.gate === "auto" ? (
                  <p>
                    Queued for execution. Job{" "}
                    <span className="font-mono tabular-nums text-[var(--text-primary)]">{submitResult.jobId}</span>
                  </p>
                ) : (
                  <p>
                    Awaiting Double-T in Helm
                    {submitResult.helmWiKey ? (
                      <>
                        {" "}
                        (<span className="font-mono tabular-nums text-[var(--text-primary)]">{submitResult.helmWiKey}</span>)
                      </>
                    ) : null}
                    . Job{" "}
                    <span className="font-mono tabular-nums text-[var(--text-primary)]">{submitResult.jobId}</span>
                  </p>
                )}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <PageHeader
        title="Provision human"
        subtitle="Compose a human provisioning manifest, preview the computed plan, then submit to the gate."
        crumbs={["Arkon", "Provision", "Provision human"]}
      />

      <section className="ak-card">
        <div className="ak-card__head">
          <h3>Subject</h3>
        </div>
        <div className="ak-card__body grid gap-4 md:grid-cols-3">
          <label className="ak-field">
            <span className="ak-label">Email</span>
            <input
              className="ak-input"
              type="email"
              value={form.email}
              onChange={(event) => updateForm({ email: event.target.value })}
              placeholder="person@example.com"
            />
          </label>
          <label className="ak-field">
            <span className="ak-label">Display name</span>
            <input
              className="ak-input"
              value={form.displayName}
              onChange={(event) => updateForm({ displayName: event.target.value })}
              placeholder="Display name"
            />
          </label>
          <label className="ak-field">
            <span className="ak-label">Mention handle</span>
            <input
              className="ak-input"
              value={form.mentionHandle}
              onChange={(event) => updateForm({ mentionHandle: event.target.value })}
              placeholder="@handle"
            />
          </label>
        </div>
      </section>

      <SectionCard title="Helm" enabled={form.helmEnabled} onToggle={(helmEnabled) => updateForm({ helmEnabled })}>
        <TenantRoleEditor
          rows={form.helmRows}
          roleOptions={[
            { value: "admin", label: "admin" },
            { value: "member", label: "member" },
          ]}
          onChange={(helmRows) => updateForm({ helmRows })}
        />
      </SectionCard>

      <SectionCard
        title="ArkonOS"
        enabled={form.arkonosEnabled}
        onToggle={(arkonosEnabled) => updateForm({ arkonosEnabled })}
      >
        <TenantRoleEditor
          rows={form.arkonosRows}
          roleOptions={[
            { value: "admin", label: "admin" },
            { value: "user", label: "user" },
            { value: "client", label: "client" },
          ]}
          onChange={(arkonosRows) => updateForm({ arkonosRows })}
        />
      </SectionCard>

      <SectionCard title="Arkon" enabled={form.arkonEnabled} onToggle={(arkonEnabled) => updateForm({ arkonEnabled })}>
        <TenantRoleEditor
          rows={form.arkonRows}
          roleOptions={[
            { value: "admin", label: "admin" },
            { value: "member", label: "member" },
          ]}
          onChange={(arkonRows) => updateForm({ arkonRows })}
        />
      </SectionCard>

      <section className="ak-card">
        <div className="ak-card__head">
          <h3>Agents</h3>
        </div>
        <div className="ak-card__body">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AGENT_SLUGS.map((slug) => (
              <label key={slug} className="flex items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] px-4 py-3">
                <input
                  type="checkbox"
                  checked={form.agents[slug]}
                  onChange={(event) => toggleAgent(slug, event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--border)] accent-[var(--accent)]"
                />
                <span className="font-mono text-sm tabular-nums text-[var(--text-primary)]">{slug}</span>
              </label>
            ))}
          </div>
          <p className="ak-field-hint mt-3">
            V1 assigns <span className="font-mono tabular-nums">claude_sdk_bridge</span> ingress to each checked agent.
          </p>
        </div>
      </section>

      <SectionCard
        title="Channels"
        enabled={form.channelsEnabled}
        onToggle={(channelsEnabled) => updateForm({ channelsEnabled })}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {form.channelSlugs.map((slug) => (
              <span
                key={slug}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-1 font-mono text-xs tabular-nums text-[var(--text-primary)]"
              >
                {slug}
                <button
                  type="button"
                  className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  onClick={() =>
                    updateForm({
                      channelSlugs: form.channelSlugs.filter((entry) => entry !== slug),
                    })
                  }
                  aria-label={`Remove ${slug}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="ak-field min-w-[16rem] flex-1">
              <span className="ak-label">Channel slug</span>
              <input
                className="ak-input"
                value={channelInput}
                onChange={(event) => setChannelInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addChannel();
                  }
                }}
                placeholder="fleet-audit-transformate"
              />
            </label>
            <div className="flex items-end">
              <button type="button" className="ak-btn" onClick={addChannel}>
                Add channel
              </button>
            </div>
          </div>
        </div>
      </SectionCard>

      {showIdentity ? (
        <SectionCard
          title="Identity"
          enabled={form.identityExpanded || anyAgentChecked}
          onToggle={(identityExpanded) => updateForm({ identityExpanded })}
        >
          <label className="ak-field max-w-xs">
            <span className="ak-label">Role</span>
            <select
              className="ak-input"
              value={form.identityRole}
              onChange={(event) =>
                updateForm({ identityRole: event.target.value as ProvisionFormState["identityRole"] })
              }
            >
              <option value="agent">agent</option>
              <option value="governor">governor</option>
            </select>
          </label>
        </SectionCard>
      ) : (
        <section className="ak-card">
          <div className="ak-card__head">
            <h3>Identity</h3>
          </div>
          <div className="ak-card__body">
            <button
              type="button"
              className="ak-btn"
              onClick={() => updateForm({ identityExpanded: true })}
            >
              <UserRound className="h-3.5 w-3.5" />
              Configure identity
            </button>
          </div>
        </section>
      )}

      <div className="flex justify-end">
        <button type="button" className="ak-btn ak-btn--primary" disabled={previewBusy} onClick={() => void handlePreview()}>
          {previewBusy ? "Reviewing..." : "Review plan"}
        </button>
      </div>
    </div>
  );
}
