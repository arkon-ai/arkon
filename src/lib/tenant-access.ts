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
 * (/api/dashboard/*). An ALLOWLIST, not an agent_token denylist: a credential
 * type added to RequestCredentialType later must have to opt in here rather
 * than inherit read access to a tenant's whole roster (WI-1846, panel R2).
 *
 * agent_token is the one deliberate exclusion — those live in plaintext .env on
 * fleet hosts and are scoped to ingest. owner_token IS included; it is the fleet
 * admin token that was this surface's only caller before WI-1846.
 */
export const DASHBOARD_CREDENTIALS: ReadonlySet<RequestCredential["type"]> = new Set([
  "user_session",
  "owner_token",
  "api_key",
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

  const bound = access.credential.tenant_id;
  if (bound && bound !== "*") return bound;

  return access.credential.type === "owner_token" ? access.tenantId : "*";
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
