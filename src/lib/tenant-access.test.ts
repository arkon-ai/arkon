import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { resolveTenantAccess } from "./tenant-access";

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
