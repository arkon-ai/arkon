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

  // Bind BEFORE role: a credential with a real tenant_id is pinned to it no
  // matter its role. Reordering these two blocks reintroduces the R4 CRITICAL.
  // Only null/undefined/"*" count as unbound — "" is a garbage row, not a
  // licence to widen (panel R6), so it falls to the reject at the bottom.
  const bound = access.credential.tenant_id;
  if (bound && bound !== "*") return bound;
  if (bound !== null && bound !== undefined && bound !== "*") return null;

  // Unbound. The fleet admin token narrows via ?tenant_id= (access.tenantId);
  // an unbound owner-role USER has no boundary to cross. Anything else has no
  // scope we can prove, so reject — an absent binding must never DEFAULT to the
  // widest one (WI-1846, panel R5: all three lanes).
  if (access.credential.type === "owner_token") return access.tenantId;
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

  if (!credential.tenant_id || credential.tenant_id === "*") return null;
  return { credential, tenantId: credential.tenant_id };
}
