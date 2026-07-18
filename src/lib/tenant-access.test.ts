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
    expect(
      dashboardTenantScope(access({ tenant_id: "tenant-a" }, "tenant-b"))
    ).toBe("tenant-a");
  });

  it("rejects an unbound non-owner rather than defaulting to the fleet", () => {
    // The whole point: an ABSENT binding must never become the WIDEST one.
    expect(dashboardTenantScope(access({ tenant_id: null }))).toBeNull();
    expect(dashboardTenantScope(access({ tenant_id: "*" }))).toBeNull();
    expect(
      dashboardTenantScope(access({ type: "api_key", role: "agent", tenant_id: null }))
    ).toBeNull();
  });

  it("rejects an unbound api_key even when its row claims role owner", async () => {
    // api_key is on the allowlist, so "role owner" alone must not buy the fleet —
    // the fleet-wide branch is for a USER session with no tenant boundary to
    // cross, not for a null-tenant key row (WI-1846, panel R5: composer).
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
