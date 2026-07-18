import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { resolveTenantAccess, dashboardTenantScope, type TenantAccess } from "./tenant-access";
import type { RequestCredential } from "@/lib/request-auth";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// A session whose token maps to a tenant_user in tenant-a → resolves to viewer.
function viewerASession() {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("viewer-a-session")) {
      return { rows: [{ id: 7, email: "v@a.test", role: "tenant_user", tenant_id: "tenant-a" }] } as never;
    }
    return { rows: [] } as never;
  });
}

// An owner-role user whose own record binds it to tenant-a — the escalation
// shape: fleet-grade role, tenant-grade binding.
function ownerASession() {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("owner-a-session")) {
      return { rows: [{ id: 8, email: "o@a.test", role: "owner", tenant_id: "tenant-a" }] } as never;
    }
    return { rows: [] } as never;
  });
}

function req(opts: { url?: string; bearer?: string; cookies?: Record<string, string> }) {
  const headers = opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : undefined;
  const r = new NextRequest(opts.url ?? "https://arkon.test/api/x", headers ? { headers } : undefined);
  for (const [k, v] of Object.entries(opts.cookies ?? {})) r.cookies.set(k, v);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
});

describe("resolveTenantAccess", () => {
  // The load-bearing isolation invariant (WI-1346 finding #1 / review #13).
  it("a non-owner supplying ?tenant_id=other resolves to their OWN tenant, even with allowOwnerWildcard", async () => {
    viewerASession();
    const access = await resolveTenantAccess(
      req({ url: "https://arkon.test/api/x?tenant_id=tenant-b", cookies: { mc_auth: "viewer-a-session" } }),
      { allowOwnerWildcard: true },
    );
    expect(access).not.toBeNull();
    expect(access?.credential.role).toBe("viewer");
    expect(access?.tenantId).toBe("tenant-a"); // NOT tenant-b
  });

  // The resolver is the SHARED choke point: /api/client/{agents,costs,dashboard,
  // api-keys} and /api/notifications/* consume its tenantId directly, with no
  // dashboardTenantScope in the path. So a bound owner escaping its binding here
  // is a cross-tenant read on all of them, not just the dashboard (panel R7).
  it("pins a tenant-BOUND owner to its own tenant despite a forged hint", async () => {
    ownerASession();
    for (const url of [
      "https://arkon.test/api/x?tenant_id=tenant-b",
      "https://arkon.test/api/x",
    ]) {
      const access = await resolveTenantAccess(
        req({ url, cookies: { mc_auth: "owner-a-session", mc_tenant: "tenant-b" } }),
        { allowOwnerWildcard: true },
      );
      expect(access?.credential.role).toBe("owner");
      // NOT tenant-b, and NOT "*" — allowOwnerWildcard must not widen a binding.
      expect(access?.tenantId).toBe("tenant-a");
    }
  });

  it("an owner with a tenant hint resolves to the hinted tenant", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never); // no session → MC_ADMIN_TOKEN → owner
    const access = await resolveTenantAccess(
      req({ url: "https://arkon.test/api/x?tenant_id=tenant-b", bearer: "owner-secret" }),
      {},
    );
    expect(access?.credential.role).toBe("owner");
    expect(access?.tenantId).toBe("tenant-b");
  });

  it("an owner with allowOwnerWildcard and no hint resolves to '*'", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const access = await resolveTenantAccess(req({ bearer: "owner-secret" }), { allowOwnerWildcard: true });
    expect(access?.tenantId).toBe("*");
  });

  it("denies when the credential is below the minimum role", async () => {
    viewerASession();
    const access = await resolveTenantAccess(
      req({ cookies: { mc_auth: "viewer-a-session" } }),
      { minimumRole: "operator" },
    );
    expect(access).toBeNull();
  });

  it("returns null when there is no credential", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const access = await resolveTenantAccess(req({}), {});
    expect(access).toBeNull();
  });

  it("rejects an empty-string binding HERE, not only in dashboardTenantScope", async () => {
    // "" is a corrupt row, not "unbound". It is falsy, so before panel R9 an
    // owner-role session carrying it skipped the pin and reached the
    // hint/wildcard branches — a garbage row reading as "intentionally unbound
    // fleet owner" on every route that uses this resolver WITHOUT the dashboard
    // helper (/api/client/*, /api/notifications/*), which is where the gate and
    // the choke point disagreed.
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("owner-blank-session")) {
        return { rows: [{ id: 9, email: "blank@a.test", role: "owner", tenant_id: "" }] } as never;
      }
      return { rows: [] } as never;
    });

    // Neither the wildcard...
    expect(
      await resolveTenantAccess(req({ cookies: { mc_auth: "owner-blank-session" } }), {
        allowOwnerWildcard: true,
      })
    ).toBeNull();

    // ...nor a client-owned hint may rescue it into a scope.
    expect(
      await resolveTenantAccess(
        req({ url: "https://arkon.test/api/x?tenant_id=tenant-b", cookies: { mc_auth: "owner-blank-session" } }),
        { allowOwnerWildcard: true }
      )
    ).toBeNull();
  });
});

describe("dashboardTenantScope", () => {
  // Tested directly, not through a route: resolveTenantAccess rejects most of
  // these shapes first, so a route-level test would pass for the wrong reason
  // and would go on passing if this function started widening (WI-1846 panel R5).
  function access(
    credential: Partial<RequestCredential>,
    tenantId = "*"
  ): TenantAccess {
    return {
      credential: { type: "user_session", role: "viewer", tenant_id: null, ...credential },
      tenantId,
    };
  }

  it("pins a bound credential to its own tenant, ignoring the resolved hint", () => {
    // role "admin" because the bind branch carries a role floor (see the floor
    // test below); the point under test here is the tenant, not the role.
    expect(
      dashboardTenantScope(access({ role: "admin", tenant_id: "tenant-a" }, "tenant-b"))
    ).toBe("tenant-a");
  });

  it("refuses a bound tenant VIEWER — these aggregates carry ssh connectivity metadata", () => {
    // The base WI-1846 fix widened this surface from admin-token-only to any
    // allowlisted credential type, which handed a read-only tenant_user the
    // agent roster including a.metadata (ssh host/user/keyPath). The floor is
    // what keeps the widening to WHICH tenant, not WHO (panel R7: opus + grok).
    expect(dashboardTenantScope(access({ role: "viewer", tenant_id: "tenant-a" }))).toBeNull();
    expect(dashboardTenantScope(access({ role: "agent", tenant_id: "tenant-a" }))).toBeNull();
    // ...but a tenant admin or owner keeps its own tenant's operator view.
    expect(dashboardTenantScope(access({ role: "admin", tenant_id: "tenant-a" }))).toBe("tenant-a");
    expect(dashboardTenantScope(access({ role: "owner", tenant_id: "tenant-a" }))).toBe("tenant-a");
  });

  it("refuses an admin token whose resolved scope is empty or blank", () => {
    // access.tenantId is the one client-derived string this function returns
    // verbatim. "" must deny, not authorize a `tenant_id = ''` filter — or skip
    // filtering entirely in a fail-open caller (panel R7: composer + grok).
    expect(
      dashboardTenantScope(access({ type: "owner_token", role: "owner", tenant_id: "*" }, ""))
    ).toBeNull();
    expect(
      dashboardTenantScope(access({ type: "owner_token", role: "owner", tenant_id: "*" }, "   "))
    ).toBeNull();
  });

  it("pins a BOUND OWNER too, whatever the hint resolved to", () => {
    // This is the R4 CRITICAL itself, at the unit layer. The pin test above uses
    // the default role "viewer", which shares the bind branch — so a refactor
    // that hoisted the owner/fleet branch ABOVE the bind branch would reopen the
    // escalation with that test still green (panel R6: grok).
    expect(
      dashboardTenantScope(access({ role: "owner", tenant_id: "tenant-a" }, "*"))
    ).toBe("tenant-a");
    expect(
      dashboardTenantScope(access({ role: "owner", tenant_id: "tenant-a" }, "tenant-b"))
    ).toBe("tenant-a");
  });

  it("rejects an unbound non-owner rather than defaulting to the fleet", () => {
    // The whole point: an ABSENT binding must never become the WIDEST one.
    expect(dashboardTenantScope(access({ tenant_id: null }))).toBeNull();
    expect(dashboardTenantScope(access({ tenant_id: "*" }))).toBeNull();
  });

  it("rejects an empty-string tenant_id instead of reading it as unbound", () => {
    // "" is a garbage row (bad write, partial migration), not a declaration that
    // the principal has no tenant. Truthiness alone would drop an owner session
    // carrying it onto the fleet branch (panel R6: grok).
    expect(dashboardTenantScope(access({ role: "owner", tenant_id: "" }))).toBeNull();
    expect(dashboardTenantScope(access({ tenant_id: "" }))).toBeNull();
  });

  it("rejects an api_key: every api_key is minted role 'agent', so it is ingest-grade", () => {
    // Not on DASHBOARD_CREDENTIALS as of panel R6 — request-auth mints EVERY
    // api_key with role "agent". Bound or unbound, owner-claiming or not, this
    // surface is closed to it; the allowlist is what closes it.
    expect(
      dashboardTenantScope(access({ type: "api_key", role: "agent", tenant_id: "tenant-a" }))
    ).toBeNull();
    expect(
      dashboardTenantScope(access({ type: "api_key", role: "agent", tenant_id: null }))
    ).toBeNull();
    expect(
      dashboardTenantScope(access({ type: "api_key", role: "owner", tenant_id: null }))
    ).toBeNull();
  });

  it("gives the fleet view to the admin token and to an unbound owner only", () => {
    expect(
      dashboardTenantScope(access({ type: "owner_token", role: "owner", tenant_id: "*" }))
    ).toBe("*");
    expect(dashboardTenantScope(access({ role: "owner", tenant_id: null }))).toBe("*");
  });

  it("lets the admin token narrow to one tenant via the resolved hint", () => {
    expect(
      dashboardTenantScope(
        access({ type: "owner_token", role: "owner", tenant_id: "*" }, "tenant-b")
      )
    ).toBe("tenant-b");
  });

  it("rejects an agent token outright", () => {
    expect(
      dashboardTenantScope(access({ type: "agent_token", role: "agent", tenant_id: "tenant-a" }))
    ).toBeNull();
  });
});
