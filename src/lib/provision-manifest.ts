export type ProvisionManifest = {
  schema_version: 1;
  subject_kind: "human";
  subject_key: string;
  display_name: string;
  mention_handle: string;
  grants: {
    helm?: { tenant: string; role: string }[];
    arkonos?: { tenant: string; role: string }[];
    arkon?: { tenant: string; role: string }[];
    agents?: { agent_slug: string; ingresses: string[] }[];
    channels?: string[];
    identity?: { role: "governor" | "agent" };
  };
  is_grant: boolean;
  initiator: { kind: "owner"; slug: "brynn"; surface: "command_board" };
};

export type TenantRoleRow = { tenant: string; role: string };

export const AGENT_SLUGS = [
  "warden",
  "codesmith",
  "dunamis",
  "sentinel",
  "lumina",
] as const;

export type AgentSlug = (typeof AGENT_SLUGS)[number];

/** V1: no ingress UI — every checked agent gets this constant. */
export const DEFAULT_AGENT_INGRESSES = ["claude_sdk_bridge"] as const;

export type ProvisionFormState = {
  email: string;
  displayName: string;
  mentionHandle: string;
  helmEnabled: boolean;
  helmRows: TenantRoleRow[];
  arkonosEnabled: boolean;
  arkonosRows: TenantRoleRow[];
  arkonEnabled: boolean;
  arkonRows: TenantRoleRow[];
  agents: Record<AgentSlug, boolean>;
  channelsEnabled: boolean;
  channelSlugs: string[];
  identityExpanded: boolean;
  identityRole: "governor" | "agent";
};

export type ProvisionStep = {
  system: string;
  tenant: string;
  action: string;
  detail: string;
};

export type PreviewResponse = {
  steps: ProvisionStep[];
  tier: "auto" | "hot";
  requiresDoubleT: boolean;
  converged: boolean;
};

export type SubmitResponse = {
  manifestId: string;
  jobId: string;
  gate: "auto" | "double_t_pending";
  helmWiKey?: string;
};

export function validateEmail(email: string): boolean {
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.includes("@");
}

export function manifestsEqual(
  a: ProvisionManifest | null | undefined,
  b: ProvisionManifest | null | undefined,
): boolean {
  if (a == null || b == null) return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

function nonEmptyRows(rows: TenantRoleRow[]): TenantRoleRow[] {
  return rows
    .map((row) => ({ tenant: row.tenant.trim(), role: row.role.trim() }))
    .filter((row) => row.tenant.length > 0 && row.role.length > 0);
}

export function buildManifest(form: ProvisionFormState): ProvisionManifest {
  const grants: ProvisionManifest["grants"] = {};

  if (form.helmEnabled) {
    const helm = nonEmptyRows(form.helmRows);
    if (helm.length > 0) grants.helm = helm;
  }

  if (form.arkonosEnabled) {
    const arkonos = nonEmptyRows(form.arkonosRows);
    if (arkonos.length > 0) grants.arkonos = arkonos;
  }

  if (form.arkonEnabled) {
    const arkon = nonEmptyRows(form.arkonRows);
    if (arkon.length > 0) grants.arkon = arkon;
  }

  const selectedAgents = AGENT_SLUGS.filter((slug) => form.agents[slug]);
  if (selectedAgents.length > 0) {
    grants.agents = selectedAgents.map((agent_slug) => ({
      agent_slug,
      ingresses: [...DEFAULT_AGENT_INGRESSES],
    }));
  }

  if (form.channelsEnabled) {
    const channels = form.channelSlugs.map((slug) => slug.trim()).filter(Boolean);
    if (channels.length > 0) grants.channels = channels;
  }

  const showIdentity = selectedAgents.length > 0 || form.identityExpanded;
  if (showIdentity) {
    grants.identity = { role: form.identityRole };
  }

  return {
    schema_version: 1,
    subject_kind: "human",
    subject_key: form.email.trim(),
    display_name: form.displayName.trim(),
    mention_handle: form.mentionHandle.trim(),
    grants,
    is_grant: true,
    initiator: { kind: "owner", slug: "brynn", surface: "command_board" },
  };
}

function provisionHeaders(): Record<string, string> {
  const cookieToken =
    typeof document !== "undefined"
      ? (document.cookie.match(/mc_auth=([^;]+)/)?.[1] ?? "")
      : "";
  const csrf =
    typeof document !== "undefined"
      ? (document.cookie.match(/mc_csrf=([^;]+)/)?.[1] ?? "")
      : "";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookieToken) headers.Authorization = `Bearer ${cookieToken}`;
  if (csrf) headers["x-csrf-token"] = csrf;
  return headers;
}

export async function previewProvision(manifest: ProvisionManifest): Promise<PreviewResponse> {
  const res = await fetch("/api/provision/human/preview", {
    method: "POST",
    headers: provisionHeaders(),
    body: JSON.stringify({ manifest }),
  });
  const data = (await res.json()) as PreviewResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Preview failed");
  }
  return data;
}

export async function submitProvision(manifest: ProvisionManifest): Promise<SubmitResponse> {
  const res = await fetch("/api/provision/human/submit", {
    method: "POST",
    headers: provisionHeaders(),
    body: JSON.stringify({ manifest }),
  });
  const data = (await res.json()) as SubmitResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Submit failed");
  }
  return data;
}

export const UPSTREAM_TIMEOUT_MS = 15_000;

export function getProvisionUpstreamConfig(): { base: string; token: string } | null {
  const base = process.env.ARKONOS_PROVISION_API_BASE?.trim();
  const token = process.env.ARKONOS_PROVISION_API_TOKEN?.trim();
  if (!base || !token) return null;
  return { base: base.replace(/\/$/, ""), token };
}

export type ProvisionUpstreamResult =
  | { ok: true; status: number; body: unknown }
  | { ok: false; status: number; body: { error: string } };

// Thin BFF (WI-1969 contract §4). The route authenticates the admin caller at the edge
// (validateRole) and forwards the manifest to the ArkonOS provisioning gate over a shared
// service credential. V1 does NOT forward a per-actor identity: the manifest's `initiator`
// is a fixed constant and only the service token crosses the wire, so the gate MUST NOT
// treat client-composed `initiator`/`grants` as authority. Authorization lives entirely in
// the gate (sibling backend WI): it applies its own tenant/role policy and holds hot-tier
// changes for Brynn's Double-T before anything executes. Forwarding the verified admin to
// the gate for per-actor attribution is a deliberate backend follow-up, out of V1 scope.
// The manifest crosses the wire in the POST body only — never a query string.
export async function forwardProvisionUpstream(
  upstreamPath: string,
  manifest: ProvisionManifest,
): Promise<ProvisionUpstreamResult> {
  const config = getProvisionUpstreamConfig();
  if (!config) {
    return { ok: false, status: 502, body: { error: "Provision API not configured" } };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

  try {
    const upstream = await fetch(`${config.base}${upstreamPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.token}`,
      },
      body: JSON.stringify({ manifest }),
      signal: controller.signal,
    });

    const body = await upstream.json();
    return { ok: true, status: upstream.status, body };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 504, body: { error: "Upstream provision API timed out" } };
    }
    return { ok: false, status: 502, body: { error: "Upstream provision API unreachable" } };
  } finally {
    clearTimeout(timeout);
  }
}
