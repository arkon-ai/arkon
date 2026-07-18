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
