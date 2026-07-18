import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { GET as getOverview } from "./overview/route";
import { GET as getRecent } from "./overview/recent/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function request(
  url: string,
  opts: { bearer?: string; cookies?: Record<string, string> } = {}
) {
  const req = new NextRequest(
    url,
    opts.bearer ? { headers: { authorization: `Bearer ${opts.bearer}` } } : undefined
  );
  for (const [name, value] of Object.entries(opts.cookies ?? {})) {
    req.cookies.set(name, value);
  }
  return req;
}

/** The call this route made for `fragment`, as [sql, params]. */
function callFor(fragment: string) {
  return mockQuery.mock.calls.find(([sql]) => String(sql).includes(fragment));
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes("JOIN user_sessions")) {
      return (params?.[0] === hash("viewer-a-session")
        ? {
            rows: [
              { id: 1, email: "a@example.com", role: "viewer", tenant_id: "tenant-a" },
            ],
          }
        : { rows: [] }) as never;
    }
    return { rows: [] } as never;
  });
});

/* WI-1846 — /api/dashboard/overview aggregated agents, daily_stats and the full
   tenants roster with no tenant predicate at all. It was gated on the fleet
   MC_ADMIN_TOKEN, so it failed closed rather than leaking; the defect is that
   the aggregate had no tenant scope to fall back on, so any widening of the
   gate exposes every tenant. These tests pin the scope itself, not the gate. */

describe("dashboard overview tenant scoping", () => {
  it("pins a tenant-scoped caller to its OWN tenant despite a forged tenant_id + cookie", async () => {
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview?tenant_id=tenant-b", {
        cookies: { mc_auth: "viewer-a-session", mc_tenant: "tenant-b" },
      })
    );

    expect(res.status).toBe(200);
    for (const fragment of ["FROM agents a", "FROM daily_stats", "FROM tenants"]) {
      const call = callFor(fragment);
      expect(call, `no query for ${fragment}`).toBeDefined();
      expect(call?.[1]).toEqual(["tenant-a"]);
    }
  });

  it("never returns the fleet-wide tenants roster to a tenant-scoped caller", async () => {
    await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "viewer-a-session" },
      })
    );

    // The roster leak is the sharpest one: without a predicate this hands every
    // tenant's id/name/domain/plan to a single tenant's user.
    expect(String(callFor("FROM tenants")?.[0])).toContain("WHERE id = $1");
  });

  it("keeps the fleet owner's cross-tenant view unscoped", async () => {
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", { bearer: "owner-secret" })
    );

    expect(res.status).toBe(200);
    const tenantsCall = callFor("FROM tenants");
    expect(String(tenantsCall?.[0])).not.toContain("WHERE id = $1");
    expect(tenantsCall?.[1]).toEqual([]);
  });

  it("rejects a request carrying only a forged tenant cookie", async () => {
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_tenant: "tenant-b" },
      })
    );

    expect(res.status).toBe(401);
  });
});

describe("dashboard overview/recent tenant scoping", () => {
  it("scopes events to the caller's tenant through the agents join", async () => {
    const res = await getRecent(
      request("https://arkon.test/api/dashboard/overview/recent?limit=5", {
        cookies: { mc_auth: "viewer-a-session", mc_tenant: "tenant-b" },
      })
    );

    expect(res.status).toBe(200);
    const call = callFor("FROM events e");
    expect(String(call?.[0])).toContain("a.tenant_id = $2");
    expect(call?.[1]).toEqual([5, "tenant-a"]);
  });

  it("rejects an unauthenticated request", async () => {
    const res = await getRecent(
      request("https://arkon.test/api/dashboard/overview/recent")
    );

    expect(res.status).toBe(401);
  });
});
