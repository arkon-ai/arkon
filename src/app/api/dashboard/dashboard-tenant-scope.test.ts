import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/**
 * The single call this route made for `fragment`, as [sql, params].
 * Asserts uniqueness: `FROM daily_stats` also appears inside the agents query's
 * cost sub-select, so a `.find()` here silently re-asserted the agents call and
 * left the todayStats aggregate untested (panel R1).
 */
function callFor(fragment: string) {
  const matches = mockQuery.mock.calls.filter(([sql]) => String(sql).includes(fragment));
  expect(matches, `expected exactly one query matching ${fragment}`).toHaveLength(1);
  return matches[0];
}

/** Rows for the credential lookups resolveRequestCredential walks, by token. */
function sessionRowsFor(tokenHash: unknown) {
  if (tokenHash === hash("viewer-a-session")) {
    return [{ id: 1, email: "a@example.com", role: "viewer", tenant_id: "tenant-a" }];
  }
  // An owner-role user whose own tenant_id is the "*" sentinel — the value
  // domain resolveTenantAccess uses for "fleet wide".
  if (tokenHash === hash("viewer-star-session")) {
    return [{ id: 2, email: "star@example.com", role: "viewer", tenant_id: "*" }];
  }
  return [];
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MC_ADMIN_TOKEN", "owner-secret");
  vi.stubEnv("MC_AGENT_TOKENS", "");
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes("JOIN user_sessions")) {
      return { rows: sessionRowsFor(params?.[0]) } as never;
    }
    if (String(sql).includes("FROM agents WHERE token_hash")) {
      return {
        rows:
          params?.[0] === hash("agent-a-token")
            ? [{ id: "agent-a", role: "operator", tenant_id: "tenant-a" }]
            : [],
      } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
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
    // Fragment must be unique to the aggregate AND the predicate asserted —
    // params alone would not catch a dropped WHERE against a mocked driver.
    for (const [label, fragment, predicate] of [
      ["agents", "FROM agents a", "WHERE a.tenant_id = $1"],
      ["today stats", "WHERE day = CURRENT_DATE", "AND tenant_id = $1"],
      ["tenants", "FROM tenants", "WHERE id = $1"],
    ] as const) {
      const call = callFor(fragment);
      expect(String(call[0]), label).toContain(predicate);
      expect(call[1], label).toEqual(["tenant-a"]);
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

  it("narrows the fleet owner to one tenant when ?tenant_id= is present", async () => {
    // API.md promises this narrowing; without a test the doc and the helper can
    // drift apart silently.
    await getOverview(
      request("https://arkon.test/api/dashboard/overview?tenant_id=tenant-b", {
        bearer: "owner-secret",
      })
    );

    expect(callFor("FROM tenants")[1]).toEqual(["tenant-b"]);
  });

  it("refuses a non-owner whose own tenant_id is the '*' sentinel", async () => {
    // "*" shares a value domain with real tenant ids, and `scoped` is a plain
    // !== "*" test — so a non-owner carrying it must fail closed, never fall
    // through to the unscoped owner SQL shape.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "viewer-star-session" },
      })
    );

    expect(res.status).toBe(401);
  });

  it("rejects an agent token even though it resolves to a real tenant", async () => {
    // Agent tokens sit in plaintext .env on fleet hosts; a leaked one must not
    // buy its tenant's whole roster + 30d cost. They 401'd here before WI-1846
    // and still do.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", { bearer: "agent-a-token" })
    );

    expect(res.status).toBe(401);
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
    expect(String(call[0])).toContain("a.tenant_id = $2");
    expect(call[1]).toEqual([5, "tenant-a"]);
  });

  it("leaves the fleet owner's feed unscoped, with the limit as the only param", async () => {
    await getRecent(
      request("https://arkon.test/api/dashboard/overview/recent?limit=5", {
        bearer: "owner-secret",
      })
    );

    const call = callFor("FROM events e");
    expect(String(call[0])).not.toContain("a.tenant_id");
    expect(call[1]).toEqual([5]);
  });

  it("clamps a non-numeric or negative limit instead of passing it to Postgres", async () => {
    for (const [raw, expected] of [["abc", 5], ["-1", 1], ["1000", 20]] as const) {
      vi.clearAllMocks();
      await getRecent(
        request(`https://arkon.test/api/dashboard/overview/recent?limit=${raw}`, {
          bearer: "owner-secret",
        })
      );
      expect(callFor("FROM events e")[1], `limit=${raw}`).toEqual([expected]);
    }
  });

  it("rejects an unauthenticated request", async () => {
    const res = await getRecent(
      request("https://arkon.test/api/dashboard/overview/recent")
    );

    expect(res.status).toBe(401);
  });
});
