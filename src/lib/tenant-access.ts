import { type NextRequest } from "next/server";
import { resolveRequestCredential, type RequestCredential } from "@/lib/request-auth";

const ROLE_RANK: Record<RequestCredential["role"], number> = {
  owner: 5,
  admin: 4,
  operator: 3,
  agent: 2,
  viewer: 1,
};

export interface TenantAccess {
  credential: RequestCredential;
  tenantId: string;
}

/**
 * Credential types allowed on the operator dashboard aggregates
 * (/api/dashboard/*). An ALLOWLIST, not a denylist: a credential type added to
 * RequestCredentialType later must have to opt in here rather than inherit read
 * access to a tenant's whole roster (WI-1846, panel R2).
 *
 * Ingest-grade principals are excluded. agent_token is the obvious one — those
 * live in plaintext .env on fleet hosts. api_key is the non-obvious one, and it
 * was on this list until panel R6: `resolveRequestCredential` mints EVERY api_key
 * with `role: "agent"` (request-auth.ts), so an API key is the same grade of
 * principal as an agent token, and admitting it would have handed a tenant's
 * ingest key the whole agent roster + metadata + threats_30d + cost_30d. This
 * surface was admin-token-only before WI-1846, so excluding it is a restoration,
 * not a new restriction. Re-admitting api_key needs a non-agent role first.
 *
 * owner_token IS included; it is the fleet admin token that was this surface's
 * only caller before WI-1846.
 */
export const DASHBOARD_CREDENTIALS: ReadonlySet<RequestCredential["type"]> = new Set([
  "user_session",
  "owner_token",
]);

/**
 * Tenant scope for the operator dashboard aggregates: the tenant id to filter
 * on, `"*"` for the fleet-wide view, or null to reject.
 *
 * `resolveTenantAccess` grants the wildcard on `credential.role === "owner"` and
 * lets any hint (`?tenant_id=`, the `mc_tenant` cookie) redirect an owner. That
 * is fine for the client portal, but on this surface it is an escalation: a user
 * session with `role: "owner"` bound to one tenant could reach every tenant just
 * by deleting `mc_tenant` — which is set `httpOnly: false`, so the client owns it
 * (WI-1846, panel R4: grok CRITICAL / opus Major, converging).
 *
 * So the hint never decides scope here. A credential whose own record binds it to
 * a tenant is pinned to that tenant, full stop. The fleet-wide view is reachable
 * only by the fleet admin token, or by an owner-role user with no tenant binding
 * at all — who has no tenant boundary to cross, and whom only an existing owner
 * can create (`/api/auth/register`).
 */
export function dashboardTenantScope(access: TenantAccess): string | null {
  if (!DASHBOARD_CREDENTIALS.has(access.credential.type)) return null;

  // Bind BEFORE role: WHICH tenant is decided by the credential's own record,
  // never by its role — reordering these blocks reintroduces the R4 CRITICAL.
  // (The floor inside the branch can only reject, never redirect.) Only
  // null/undefined/"*" count as unbound — "" is a garbage row, not a licence to
  // widen (panel R6), so it falls to the reject at the bottom.
  const bound = access.credential.tenant_id;
  if (bound && bound !== "*") {
    // The pin decides which tenant; this floor decides whether the caller may
    // read this surface at all. These aggregates carry `a.metadata`, which holds
    // each agent's connectivity block — ssh host, user and key path (see
    // /api/agents/register) — and the surface was admin-token-only before
    // WI-1846. A `tenant_user` (which request-auth maps to role "viewer") must
    // not inherit fleet-operator detail merely by being bound (panel R7: opus +
    // grok, converging). A tenant admin still gets its own tenant's view, so
    // nobody who could reach this endpoint before the WI loses access.
    return roleAtLeast(access.credential.role, "admin") ? bound : null;
  }
  if (bound !== null && bound !== undefined && bound !== "*") return null;

  // Unbound. The fleet admin token narrows via ?tenant_id= (access.tenantId);
  // an unbound owner-role USER has no boundary to cross. Anything else has no
  // scope we can prove, so reject — an absent binding must never DEFAULT to the
  // widest one (WI-1846, panel R5: all three lanes).
  if (access.credential.type === "owner_token") {
    // access.tenantId is the only client-derived string that reaches a return
    // here. "" would read as authorized and filter on `tenant_id = ''` — or skip
    // the filter entirely in a caller that treats a non-null scope as "narrow
    // only if truthy" — so prove it before handing it back (panel R7: composer +
    // grok, converging).
    return access.tenantId.trim() === "" ? null : access.tenantId;
  }
  return access.credential.role === "owner" ? "*" : null;
}

export function roleAtLeast(role: RequestCredential["role"], required: RequestCredential["role"]): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[required];
}

export async function resolveTenantAccess(
  req: NextRequest,
  options: { minimumRole?: RequestCredential["role"]; allowOwnerWildcard?: boolean } = {}
): Promise<TenantAccess | null> {
  const credential = await resolveRequestCredential(req);
  if (!credential) return null;
  if (options.minimumRole && !roleAtLeast(credential.role, options.minimumRole)) return null;

  // "" is a corrupt binding (bad write, partial migration), not a declaration
  // that the principal has no tenant. Truthiness alone would carry an
  // owner-role row bearing it PAST the pin below and onto the hint/wildcard
  // branches — a garbage row read as "intentionally unbound fleet owner".
  // dashboardTenantScope already rules "" garbage; the shared choke point has
  // to agree, or the two disagree on every route that skips the helper (panel
  // R9: composer Major, in part — the non-owner half of that finding is
  // already closed by the role gate on the hint branch below).
  if (credential.tenant_id === "") return null;

  // A credential bound to a real tenant is pinned to it HERE, at the shared
  // choke point, before any hint is read. Both hints below are client-owned
  // (`?tenant_id=`, and `mc_tenant` is set httpOnly:false), so honouring them for
  // a BOUND owner let that owner reach every other tenant on every route using
  // this resolver. Pinning inside dashboardTenantScope fixed the dashboard only:
  // /api/client/{agents,costs,dashboard,api-keys} and /api/notifications/* call
  // this resolver WITHOUT that helper and stayed exposed (panel R7: grok Major).
  // Unbound principals are untouched — the fleet owner keeps the tenant switcher.
  if (credential.tenant_id && credential.tenant_id !== "*") {
    return { credential, tenantId: credential.tenant_id };
  }

  const hintedTenant =
    req.nextUrl.searchParams.get("tenant_id") ??
    req.cookies.get("mc_tenant")?.value ??
    null;

  if (credential.role === "owner" && hintedTenant && hintedTenant !== "*") {
    return { credential, tenantId: hintedTenant };
  }

  if (credential.role === "owner" && options.allowOwnerWildcard) {
    return { credential, tenantId: "*" };
  }

  // Unbound and not an owner: nothing above resolved a scope, and the binding
  // that used to be consulted here is already handled by the pin above — by this
  // line `tenant_id` is only ever falsy or "*". Fail closed.
  return null;
}
