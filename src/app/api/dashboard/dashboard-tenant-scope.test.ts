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
  // The ordinary tenant-scoped operator: bound to tenant-a and above the role
  // floor, so it is the principal the scoping tests below exercise.
  if (tokenHash === hash("admin-a-session")) {
    return [{ id: 1, email: "a@example.com", role: "admin", tenant_id: "tenant-a" }];
  }
  // Same binding, below the floor: request-auth maps `tenant_user` to "viewer",
  // and these aggregates expose a.metadata (ssh host/user/keyPath), so this one
  // must be refused outright rather than scoped (panel R7).
  if (tokenHash === hash("viewer-a-session")) {
    return [{ id: 6, email: "ro@example.com", role: "viewer", tenant_id: "tenant-a" }];
  }
  // A non-owner whose own tenant_id is the "*" sentinel — the value domain
  // resolveTenantAccess uses for "fleet wide". Role `admin` on purpose: it
  // clears the dashboard role floor, so a test using it isolates the SENTINEL
  // rather than re-proving the floor (panel R11: grok Major).
  if (tokenHash === hash("admin-star-session")) {
    return [{ id: 2, email: "star@example.com", role: "admin", tenant_id: "*" }];
  }
  // role "owner" with a REAL tenant id. resolveTenantAccess keys the wildcard on
  // ROLE, not on credential type, so this row decides the scoped/unscoped branch.
  if (tokenHash === hash("owner-role-session")) {
    return [{ id: 3, email: "own@example.com", role: "owner", tenant_id: "tenant-a" }];
  }
  // An owner with no tenant binding at all — the genuine fleet owner shape.
  if (tokenHash === hash("owner-unbound-session")) {
    return [{ id: 4, email: "fleet@example.com", role: "owner", tenant_id: null }];
  }
  // Non-owner with no binding: legacy row, partial provision, manual SQL.
  if (tokenHash === hash("viewer-unbound-session")) {
    return [{ id: 5, email: "orphan@example.com", role: "viewer", tenant_id: null }];
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
    if (String(sql).includes("FROM api_keys")) {
      return {
        rows:
          params?.[0] === hash("ak_live_key-a")
            ? [{ id: 10, tenant_id: "tenant-a" }]
            : [],
      } as never;
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

/**
 * The three aggregates the overview route must scope, as
 * [label, fragment-unique-to-that-query, the predicate it must carry].
 * Fragment uniqueness is enforced by callFor; asserting the predicate text as
 * well as the params is what catches a dropped WHERE against a mocked driver.
 */
const SCOPED_AGGREGATES = [
  ["agents", "SELECT a.id, a.name, a.metadata", "WHERE a.tenant_id = $1"],
  ["today stats", "WHERE day = CURRENT_DATE", "AND a.tenant_id = $1)"],
  ["tenants", "FROM tenants", "WHERE id = $1"],
] as const;

/**
 * Assert the predicate is present AND not disarmed.
 *
 * Presence alone is not isolation: `WHERE a.tenant_id = $1 OR TRUE` contains the
 * predicate, binds the same $1, returns 200 and leaks the fleet — every
 * substring-and-params assertion in this file stays green through it. Since
 * these tests ARE the merge gate for the WI-1846 scope fix, the widening shapes
 * have to be excluded explicitly (panel R11: grok Major).
 */
function expectTenantPredicate(sql: string, predicate: string, label: string) {
  expect(sql, label).toContain(predicate);
  // No boolean widening anywhere in the statement: `OR TRUE`, `OR 1=1`,
  // `OR tenant_id IS NOT NULL`, `OR id IS NOT NULL`.
  expect(sql, `${label}: predicate disarmed by an OR`).not.toMatch(
    /\bOR\s+(TRUE\b|1\s*=\s*1|[a-z_.]*\btenant_id\s+IS\s+NOT\s+NULL|[a-z_.]*\bid\s+IS\s+NOT\s+NULL)/i
  );
}

/* WI-1846 — /api/dashboard/overview aggregated agents, daily_stats and the full
   tenants roster with no tenant predicate at all. It was gated on the fleet
   MC_ADMIN_TOKEN, so it failed closed rather than leaking; the defect is that
   the aggregate had no tenant scope to fall back on, so any widening of the
   gate exposes every tenant. These tests pin the scope itself, not the gate. */

describe("dashboard overview tenant scoping", () => {
  it("pins a tenant-scoped caller to its OWN tenant despite a forged tenant_id + cookie", async () => {
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview?tenant_id=tenant-b", {
        cookies: { mc_auth: "admin-a-session", mc_tenant: "tenant-b" },
      })
    );

    expect(res.status).toBe(200);
    for (const [label, fragment, predicate] of SCOPED_AGGREGATES) {
      const call = callFor(fragment);
      expectTenantPredicate(String(call[0]), predicate, label);
      expect(call[1], label).toEqual(["tenant-a"]);
    }
  });

  it("never returns the fleet-wide tenants roster to a tenant-scoped caller", async () => {
    await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "admin-a-session" },
      })
    );

    // The roster leak is the sharpest one: without a predicate this hands every
    // tenant's id/name/domain/plan to a single tenant's user.
    expect(String(callFor("FROM tenants")[0])).toContain("WHERE id = $1");
  });

  it("keeps the fleet owner's cross-tenant view unscoped", async () => {
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", { bearer: "owner-secret" })
    );

    expect(res.status).toBe(200);
    const tenantsCall = callFor("FROM tenants");
    expect(String(tenantsCall[0])).not.toContain("WHERE id = $1");
    expect(tenantsCall[1]).toEqual([]);
  });

  it("narrows the fleet owner to one tenant when ?tenant_id= is present", async () => {
    // API.md promises this narrowing; without a test the doc and the helper can
    // drift apart silently. Assert all three aggregates and the predicate text,
    // not just the roster's params: narrowing that reached `tenants` while
    // leaving agents and daily_stats fleet-wide is the leak, not a cosmetic gap.
    await getOverview(
      request("https://arkon.test/api/dashboard/overview?tenant_id=tenant-b", {
        bearer: "owner-secret",
      })
    );

    for (const [label, fragment, predicate] of SCOPED_AGGREGATES) {
      const call = callFor(fragment);
      expectTenantPredicate(String(call[0]), predicate, label);
      expect(call[1], label).toEqual(["tenant-b"]);
    }
  });

  it("rejects a valid tenant-bound api_key — ingest-grade, not operator", async () => {
    // API.md admitted API keys to this surface until panel R6. resolveRequestCredential
    // mints every api_key with role "agent", so admitting them handed a tenant's
    // ingest key the same roster + metadata + cost payload agent_token was
    // excluded to protect. The key below is REAL and resolves to tenant-a.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        bearer: "ak_live_key-a",
      })
    );

    expect(res.status).toBe(401);
    // Positive control, same shape as the agent-token test: prove the key
    // actually resolved, so this is an allowlist rejection and not an
    // unrecognized-token 401 that would pass with the allowlist deleted.
    // Assert the lookup ran with the SEEDED hash, not merely that it ran: if the
    // fixture's hash scheme ever diverges from what resolveRequestCredential
    // queries with, the mock returns [], the 401 becomes an unrecognized-token
    // 401, and deleting DASHBOARD_CREDENTIALS would leave this green — exactly
    // what the control exists to catch (panel R7: opus).
    expect(
      mockQuery.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes("FROM api_keys") &&
          (params as unknown[] | undefined)?.[0] === hash("ak_live_key-a")
      )
    ).toBe(true);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("FROM tenants"))
    ).toBe(false);
  });

  it("refuses a tenant-less non-owner instead of handing it the fleet", async () => {
    // Belt-and-braces: resolveTenantAccess already rejects an unbound non-owner,
    // so this 401 comes from that layer today. dashboardTenantScope is the second
    // layer and is pinned directly in tenant-access.test.ts — an absent binding
    // must never default to the widest scope at either layer.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "viewer-unbound-session" },
      })
    );

    expect(res.status).toBe(401);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("FROM tenants"))
    ).toBe(false);
  });

  it("refuses a bound tenant VIEWER — bound is not the same as entitled", async () => {
    // Unlike the two 401s above, this one is NOT resolveTenantAccess's: a bound
    // viewer resolves fine and reaches dashboardTenantScope, which is the only
    // thing standing between a read-only tenant_user and every agent's ssh
    // connectivity metadata. Deleting the role floor leaves the rest of this
    // suite green (the scoping tests use an admin), so this is the one test that
    // fails for it — hence the positive control that the session really resolved.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "viewer-a-session" },
      })
    );

    expect(res.status).toBe(401);
    expect(
      mockQuery.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes("JOIN user_sessions") &&
          (params as unknown[] | undefined)?.[0] === hash("viewer-a-session")
      )
    ).toBe(true);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("SELECT a.id, a.name, a.metadata"))
    ).toBe(false);
  });

  it("refuses a non-owner whose own tenant_id is the '*' sentinel", async () => {
    // "*" shares a value domain with real tenant ids, so a non-owner carrying it
    // must fail closed rather than reach the unscoped SQL shape.
    //
    // ABOVE the role floor deliberately. With a `viewer` fixture this test was
    // vacuous: the floor refuses viewers anyway, so deleting the "*" handling
    // entirely left it green and it pinned the floor, not the sentinel (panel
    // R11: grok Major). `admin` clears the floor, which makes "*" the only
    // variable under test.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "admin-star-session" },
      })
    );

    expect(res.status).toBe(401);
    // Positive control: the lookup really ran for THIS fixture, so a renamed or
    // deleted row cannot pass as "unrecognized token" (panel R2 shape).
    expect(
      mockQuery.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes("JOIN user_sessions") &&
          (params as unknown[] | undefined)?.[0] === hash("admin-star-session")
      )
    ).toBe(true);
    // And no aggregate ran — 401 before SQL, not an unscoped query whose rows
    // were discarded late.
    for (const [, fragment] of SCOPED_AGGREGATES) {
      expect(
        mockQuery.mock.calls.some(([sql]) => String(sql).includes(fragment)),
        `${fragment} must not run`
      ).toBe(false);
    }
  });

  /* The escalation the panel converged on (grok CRITICAL / opus Major, R4):
     resolveTenantAccess grants the wildcard on role and lets a hint redirect an
     owner — but mc_tenant is httpOnly:false, so the client owns that hint. A
     tenant-bound owner-role session must therefore be pinned by its DB record,
     no matter what hint it sends or withholds. All three vectors below returned
     the whole fleet before dashboardTenantScope existed. */
  const OWNER_ROLE_ESCALATION = [
    ["deleting the mc_tenant cookie", "https://arkon.test/api/dashboard/overview", {}],
    [
      "setting mc_tenant=*",
      "https://arkon.test/api/dashboard/overview",
      { mc_tenant: "*" },
    ],
    [
      "asking for another tenant by query",
      "https://arkon.test/api/dashboard/overview?tenant_id=tenant-b",
      { mc_tenant: "tenant-a" },
    ],
  ] as const;

  for (const [vector, url, extraCookies] of OWNER_ROLE_ESCALATION) {
    it(`pins a tenant-bound role:'owner' session to its own tenant despite ${vector}`, async () => {
      const res = await getOverview(
        request(url, {
          cookies: { mc_auth: "owner-role-session", ...extraCookies },
        })
      );

      expect(res.status).toBe(200);
      // All three aggregates, not just the roster: a partial fix that scoped
      // `tenants` while leaving agents and daily_stats open would pass a
      // roster-only assertion while leaking the high-value payload.
      for (const [label, fragment, predicate] of SCOPED_AGGREGATES) {
        const call = callFor(fragment);
        expectTenantPredicate(String(call[0]), predicate, label);
        expect(call[1], label).toEqual(["tenant-a"]);
      }
    });
  }

  it("still gives an unbound owner-role session the fleet-wide view", async () => {
    // The deliberate residual: an owner-role user with NO tenant_id has no tenant
    // boundary to cross, and only an existing owner can create one
    // (/api/auth/register:14). Pinned so the escalation fix above cannot quietly
    // become a 401 for the fleet owner's own login.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "owner-unbound-session" },
      })
    );

    expect(res.status).toBe(200);
    const tenantsCall = callFor("FROM tenants");
    expect(String(tenantsCall[0])).not.toContain("WHERE id = $1");
    expect(tenantsCall[1]).toEqual([]);
  });

  it("rejects an agent token even though it resolves to a real tenant", async () => {
    // Agent tokens sit in plaintext .env on fleet hosts; a leaked one must not
    // buy its tenant's whole roster + 30d cost. They 401'd here before WI-1846
    // and still do.
    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", { bearer: "agent-a-token" })
    );

    expect(res.status).toBe(401);
    // Positive control: 401 is also the answer for a token the helper never
    // recognized, so prove the agent lookup actually ran and matched — otherwise
    // dropping the credential allowlist would still pass this test.
    // On the seeded hash, for the reason given on the api_key control above.
    expect(
      mockQuery.mock.calls.some(
        ([sql, params]) =>
          String(sql).includes("FROM agents WHERE token_hash") &&
          (params as unknown[] | undefined)?.[0] === hash("agent-a-token")
      )
    ).toBe(true);
    expect(
      mockQuery.mock.calls.some(([sql]) => String(sql).includes("FROM tenants"))
    ).toBe(false);
  });

  it("ignores a caller-supplied '*' sentinel from a tenant-scoped caller", async () => {
    // "*" is the single value that flips a caller onto the unscoped owner SQL.
    // The other forgery test uses an ordinary tenant id; this one uses the magic
    // value itself.
    await getOverview(
      request("https://arkon.test/api/dashboard/overview?tenant_id=*", {
        cookies: { mc_auth: "admin-a-session", mc_tenant: "*" },
      })
    );

    const call = callFor("SELECT a.id, a.name, a.metadata");
    expect(String(call[0])).toContain("WHERE a.tenant_id = $1");
    expect(call[1]).toEqual(["tenant-a"]);
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
        cookies: { mc_auth: "admin-a-session", mc_tenant: "tenant-b" },
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

/* WI-1846 panel R9 — the role floor decided WHO reaches this surface and nothing
   narrowed WHAT they get. `metadata.connectivity.ssh` is {host, user, keyPath}
   for the agent's HOST, and /api/agents/register defaults its user to the fleet
   operator's own login. Pre-WI only MC_ADMIN_TOKEN could read this route, so
   that block only ever reached the fleet operator; admitting tenant-side admins
   without projecting the row hands a customer the ssh coordinates of fleet
   infrastructure. These tests pin the projection, not the gate. */

const KEY_PATH = "/home/brynn/.ssh/id_ed25519";

/**
 * An agent row shaped like /api/agents/register writes it, plus two keys no
 * writer produces today: a hypothetical future secret beside `ssh`, and one at
 * the top level. A denylist that only knew about `ssh` would leak both — they
 * are here so the ALLOWLIST is what the test proves (panel R11: grok Major).
 */
const AGENT_METADATA = {
  connectivity: {
    framework: "openclaw",
    host: "100.90.212.53",
    port: 18789,
    ssh: { host: "100.90.212.53", user: "brynn", keyPath: KEY_PATH },
    password: "hunter2-connectivity",
  },
  credentials: { apiToken: "tok-should-never-ship" },
  tags: ["prod"],
  model: "claude-opus-4-8",
  provider: "anthropic",
  instance: "eu-open",
  role: "primary",
};

/** beforeEach's mock returns no agent rows; the projection needs one to project. */
function withAgentRow() {
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (String(sql).includes("JOIN user_sessions")) {
      return { rows: sessionRowsFor(params?.[0]) } as never;
    }
    if (String(sql).includes("SELECT a.id, a.name, a.metadata")) {
      return {
        rows: [
          {
            id: "agent-a",
            name: "lumina",
            metadata: AGENT_METADATA,
            tenant_id: "tenant-a",
          },
        ],
      } as never;
    }
    return { rows: [] } as never;
  });
}

describe("dashboard overview metadata projection", () => {
  it("never sends an agent's ssh block to a tenant-scoped admin", async () => {
    withAgentRow();

    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "admin-a-session" },
      })
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.agents).toHaveLength(1);
    expect(body.agents[0].metadata).not.toHaveProperty("connectivity");
    // The rule is about the SECRETS, not about the key names we happened to
    // think of: assert each one is absent from the WHOLE serialized response, so
    // relocating any of them inside metadata cannot pass this test. `password`
    // and `credentials` are exactly the keys a one-key `delete ssh` would leak.
    const serialized = JSON.stringify(body);
    for (const secret of [KEY_PATH, "hunter2-connectivity", "tok-should-never-ship"]) {
      expect(serialized, `leaked ${secret}`).not.toContain(secret);
    }
  });

  it("passes through the four keys the dashboard actually renders", async () => {
    withAgentRow();

    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "admin-a-session" },
      })
    );
    const body = await res.json();

    // Without this, returning `metadata: {}` would pass the test above while
    // silently gutting the dashboard. These four are what the UI reads and all
    // that OverviewAgent.metadata (a flat scalar map) can represent.
    expect(body.agents[0].metadata).toEqual({
      model: "claude-opus-4-8",
      provider: "anthropic",
      instance: "eu-open",
      role: "primary",
    });
    expect(body.agents[0].name).toBe("lumina");
  });

  it("leaves the fleet admin token's payload exactly as it was before WI-1846", async () => {
    withAgentRow();

    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", { bearer: "owner-secret" })
    );
    const body = await res.json();

    // This principal is the surface's only pre-WI caller. Narrowing it too would
    // make the WI a regression for the operator rather than a restoration.
    expect(body.agents[0].metadata).toEqual(AGENT_METADATA);
    expect(body.agents[0].metadata.connectivity.ssh.keyPath).toBe(KEY_PATH);
  });

  it("projects for an unbound owner SESSION, which could not reach this route at all before", async () => {
    withAgentRow();

    const res = await getOverview(
      request("https://arkon.test/api/dashboard/overview", {
        cookies: { mc_auth: "owner-unbound-session" },
      })
    );
    const body = await res.json();

    // Fleet-WIDE scope, but not the fleet admin TOKEN: the projection keys on
    // credential type, so a newly-admitted principal does not inherit the
    // operator's payload just by resolving to "*".
    expect(res.status).toBe(200);
    expect(body.agents[0].metadata).not.toHaveProperty("connectivity");
    expect(JSON.stringify(body)).not.toContain(KEY_PATH);
  });
});
