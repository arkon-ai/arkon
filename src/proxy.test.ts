import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { proxy, isPublicAsset } from "./proxy";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

type TestRequestInit = Omit<RequestInit, "signal"> & { cookies?: Record<string, string> };

function request(path: string, init: TestRequestInit = {}) {
  const { cookies, ...requestInit } = init;
  const req = new NextRequest(`https://arkon.test${path}`, requestInit);
  for (const [name, value] of Object.entries(cookies ?? {})) {
    req.cookies.set(name, value);
  }
  return req;
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    const tokenHash = params?.[0];
    if (sql.includes("JOIN user_sessions") && tokenHash === hash("valid-session")) {
      return { rows: [{ id: 1, email: "owner@example.com", role: "owner", tenant_id: "*" }] } as never;
    }
    if (sql.includes("FROM api_keys") && tokenHash === hash("ak_live_valid")) {
      return { rows: [{ id: 7, tenant_id: "transformate" }] } as never;
    }
    if (sql.includes("UPDATE api_keys")) {
      return { rows: [] } as never;
    }
    return { rows: [] } as never;
  });
});

describe("proxy auth and csrf gates", () => {
  it("rejects an invalid bearer instead of accepting header presence", async () => {
    const res = await proxy(request("/api/dashboard/overview", {
      headers: { authorization: "Bearer bogus" },
    }));

    expect(res.status).toBe(401);
  });

  it("rejects protected API requests with no valid cookie or bearer", async () => {
    const res = await proxy(request("/api/dashboard/overview"));

    expect(res.status).toBe(401);
  });

  it("accepts a validated API key credential", async () => {
    const res = await proxy(request("/api/dashboard/overview", {
      headers: { authorization: "Bearer ak_live_valid" },
    }));

    expect(res.status).toBe(200);
  });

  it("does not let user-session cookies mutate without CSRF", async () => {
    const res = await proxy(request("/api/workflows", {
      method: "POST",
      cookies: { mc_auth: "valid-session" },
    }));

    expect(res.status).toBe(403);
  });

  it("does not let an owner token carried in the mc_auth cookie mutate without CSRF (transformate WI-3990)", async () => {
    // FLIPPED (transformate WI-4495): was 403 (CSRF). The owner key in a cookie now resolves nothing at all
    // (key compares by Bearer only), so the request is refused 401 before CSRF, and the stale cookie is expired.
    const res = await proxy(request("/api/workflows", {
      method: "POST",
      cookies: { mc_auth: "owner-secret" },
    }));

    expect(res.status).toBe(401);
    expect(res.headers.getSetCookie().find((c) => c.startsWith("mc_auth="))).toMatch(/^mc_auth=;.*Max-Age=0/i);
  });

  it("still lets the owner token as a Bearer HEADER mutate without CSRF (transformate WI-3990 guard)", async () => {
    const res = await proxy(request("/api/workflows", {
      method: "POST",
      headers: { authorization: "Bearer owner-secret" },
    }));

    expect(res.status).toBe(200);
  });

  it("lets a valid non-browser bearer mutate without CSRF", async () => {
    const res = await proxy(request("/api/workflows", {
      method: "POST",
      headers: { authorization: "Bearer ak_live_valid" },
    }));

    expect(res.status).toBe(200);
  });
});

describe("isPublicAsset — static brand-asset extension bypass (transformate WI-1925)", () => {
  it.each([
    "/icon.svg",
    "/wordmark.svg",
    "/arkon-glyph.svg",
    "/og-image.png",
    "/site.webmanifest",
    "/favicon.ico",
  ])("%s is a public asset", (pathname) => {
    expect(isPublicAsset(pathname)).toBe(true);
  });

  it.each([
    "/api/anything",
    "/dashboard",
    "/icon.svg.html",
  ])("%s is not a public asset", (pathname) => {
    expect(isPublicAsset(pathname)).toBe(false);
  });
  // Note: root-anchored (^/[^/]+\.ext$) so a multi-segment string like
  // "/foo/../icon.svg" does NOT match — the internal slashes fall outside
  // [^/]+. NextRequest.nextUrl.pathname is also normalized before proxy()
  // sees it, so such a string never reaches isPublicAsset as-is anyway; the
  // regex itself rejecting it is defense-in-depth, not the only line.
});

describe("proxy — static brand assets bypass auth and fall through to 200 (transformate WI-1925)", () => {
  // Asserting the actual success shape (200, no Location) rather than just
  // "not 307" — a regression to 401/403/302 would stay green under a bare
  // not-307 check (panel R1 minor).
  it.each(["/icon.svg", "/wordmark.svg", "/arkon-glyph.svg", "/og-image.png", "/site.webmanifest"])(
    "unauthenticated GET %s falls through to 200 with no redirect",
    async (pathname) => {
      const res = await proxy(request(pathname));
      expect(res.status).toBe(200);
      expect(res.headers.get("location")).toBeNull();
    },
  );

  // /manifest.json is EXACT-matched in isPublicPath, not isPublicAsset (no "json"
  // in the extension regex — that would auth-bypass every *.json pathname
  // app-wide) and not a PUBLIC_PATHS entry (startsWith would also bless
  // /manifest.json.bak etc. — panel R2 minor). Regression guard: removing the
  // enumerated "/manifest" prefix check in e497c19 dropped this path's bypass
  // entirely until re-added as this exact pin. (config.matcher also excludes
  // /manifest.json upstream, but that's out-of-diff config this suite can't
  // see — this pin is the code-level invariant.)
  it("unauthenticated GET /manifest.json falls through to 200 with no redirect", async () => {
    const res = await proxy(request("/manifest.json"));
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
  });

  it.each(["/manifest.json.bak", "/manifest.json/x"])(
    "unauthenticated GET %s stays behind the auth gate (exact pin, not a prefix)",
    async (pathname) => {
      const res = await proxy(request(pathname));
      expect(res.status).toBe(307);
    },
  );
});

describe("isPublicAsset — root-anchored, does not bypass nested pathnames (panel R1 major, transformate WI-1925)", () => {
  it.each([
    "/dashboard/report.png",
    "/api/export.svg",
    "/settings/avatar.png",
    "/tenants/acme/logo.svg",
  ])("%s is NOT a public asset (nested path, extension alone is not enough)", (pathname) => {
    expect(isPublicAsset(pathname)).toBe(false);
  });
});

/** The Set-Cookie row the answer carries for mc_auth (undefined when it sets none). */
function mcAuthSetCookie(res: Response): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith("mc_auth="));
}

/** mc_auth is expired: an empty value, Max-Age=0, HttpOnly, Path=/ (transformate WI-4494 S6). */
function expectMcAuthExpired(res: Response) {
  const row = mcAuthSetCookie(res);
  expect(row).toBeDefined();
  expect(row).toMatch(/^mc_auth=;/);
  expect(row).toMatch(/Max-Age=0/i);
  expect(row).toMatch(/HttpOnly/i);
  expect(row).toMatch(/Path=\//i);
}

describe("/api/auth/init stays reachable so the 410 reaches old clients (transformate WI-4494 S5)", () => {
  // GREEN at the base by design (S10, named): the row stays in PUBLIC_PATHS (proxy.ts:13); this pins it.
  it("POST /api/auth/init with no credential passes the proxy gate (public path)", async () => {
    const res = await proxy(request("/api/auth/init", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(mcAuthSetCookie(res)).toBeUndefined();
  });

  // GREEN at the base by design (S10, named): the row stays in the CSRF exempt list (proxy.ts:134-139).
  it("POST /api/auth/init with a cookie and no CSRF token is not refused 403 (CSRF exempt)", async () => {
    const res = await proxy(request("/api/auth/init", {
      method: "POST",
      headers: { authorization: "Bearer owner-secret" },
      cookies: { mc_auth: "stale-cookie-value" },
    }));
    expect(res.status).toBe(200);
  });

  it("the owner key through the proxy and the init handler gets 410 init_retired and zero Set-Cookie", async () => {
    const { POST } = await import("@/app/api/auth/init/route");
    const req = request("/api/auth/init", { method: "POST", headers: { authorization: "Bearer owner-secret" } });
    const gate = await proxy(req);
    expect(gate.status).toBe(200);
    const res = await POST(req);
    expect(res.status).toBe(410);
    expect(await res.json()).toEqual({ error: "init_retired" });
    expect(res.headers.getSetCookie()).toEqual([]);
  });
});

describe("the stale mc_auth cookie is expired on the refusal (transformate WI-4494 S6)", () => {
  it("an mc_auth cookie with no Bearer that resolves no credential: the API 401 expires mc_auth (Max-Age=0, HttpOnly)", async () => {
    const res = await proxy(request("/api/dashboard/overview", { cookies: { mc_auth: "stale-cookie-value" } }));
    expect(res.status).toBe(401);
    expectMcAuthExpired(res);
  });

  it("an mc_auth cookie with no Bearer that resolves no credential: the page redirect to /login expires mc_auth", async () => {
    const res = await proxy(request("/dashboard", { cookies: { mc_auth: "stale-cookie-value" } }));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://arkon.test/login");
    expectMcAuthExpired(res);
  });

  // GREEN at the base by design (S10, named control): a valid session is never expired.
  it("a valid session cookie passes and its cookie is left alone", async () => {
    const res = await proxy(request("/api/dashboard/overview", { cookies: { mc_auth: "valid-session" } }));
    expect(res.status).toBe(200);
    expect(mcAuthSetCookie(res)).toBeUndefined();
  });

  // GREEN at the base by design (S10, named control): with a Bearer present the cookie was never read (Bearer
  // precedence), so the 401 leaves it alone.
  it("a junk Bearer with a cookie: 401 and the cookie is left alone (the cookie was not read)", async () => {
    const res = await proxy(request("/api/dashboard/overview", {
      headers: { authorization: "Bearer bogus" },
      cookies: { mc_auth: "valid-session" },
    }));
    expect(res.status).toBe(401);
    expect(mcAuthSetCookie(res)).toBeUndefined();
  });

  // GREEN at the base by design (S10, named control): no cookie, nothing to expire.
  it("no cookie and no Bearer: 401 with zero Set-Cookie", async () => {
    const res = await proxy(request("/api/dashboard/overview"));
    expect(res.status).toBe(401);
    expect(mcAuthSetCookie(res)).toBeUndefined();
  });
});

describe("proxy: a key carried in a cookie resolves nothing (transformate WI-4495 T1b, S6, S7)", () => {
  it("T1b the raw owner key a pre-U5 browser holds in mc_auth: 401 and mc_auth expired", async () => {
    const res = await proxy(request("/api/dashboard/overview", { cookies: { mc_auth: "owner-secret" } }));
    expect(res.status).toBe(401);
    expectMcAuthExpired(res);
  });

  it("T1b the raw owner key in mc_auth on a page: the /login redirect, mc_auth expired", async () => {
    const res = await proxy(request("/", { cookies: { mc_auth: "owner-secret" } }));
    expect(res.status).toBe(307);
    expectMcAuthExpired(res);
  });

  it("T1b a fake MC_AGENT_TOKENS key in mc_auth: 401 and mc_auth expired", async () => {
    process.env.MC_AGENT_TOKENS = "bootstrap-bot:FAKE-envkey-q7x2m9w4p8";
    const res = await proxy(request("/api/dashboard/overview", { cookies: { mc_auth: "FAKE-envkey-q7x2m9w4p8" } }));
    expect(res.status).toBe(401);
    expectMcAuthExpired(res);
  });

  it("an agents-table token in mc_auth is refused: 401 and mc_auth expired", async () => {
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (sql.includes("FROM agents WHERE token_hash") && params?.[0] === hash("agent-table-token")) {
        return { rows: [{ id: "agent-t", role: "admin", tenant_id: "transformate" }] } as never;
      }
      return { rows: [] } as never;
    });
    const res = await proxy(request("/api/dashboard/overview", { cookies: { mc_auth: "agent-table-token" } }));
    expect(res.status).toBe(401);
    expectMcAuthExpired(res);
  });

  // GREEN at the base by design (S10, positive control).
  it("the same owner key as a Bearer passes the proxy", async () => {
    const res = await proxy(request("/api/dashboard/overview", { headers: { authorization: "Bearer owner-secret" } }));
    expect(res.status).toBe(200);
  });

  // GREEN at the base by design (S10, named): Bearer precedence (proxy.ts:146, request-auth.ts:124-130).
  it("a junk Bearer with a valid owner session cookie is refused: the Bearer path only", async () => {
    const res = await proxy(request("/api/dashboard/overview", {
      headers: { authorization: "Bearer junk" },
      cookies: { mc_auth: "valid-session" },
    }));
    expect(res.status).toBe(401);
  });

  // GREEN at the base by design (S10, kept and named): the ak_live_ cookie read stays until W03 U6.
  it("an ak_live_ key in mc_auth still passes the proxy (kept, W03 U6) and needs CSRF to mutate", async () => {
    const read = await proxy(request("/api/dashboard/overview", { cookies: { mc_auth: "ak_live_valid" } }));
    expect(read.status).toBe(200);
    const write = await proxy(request("/api/workflows", { method: "POST", cookies: { mc_auth: "ak_live_valid" } }));
    expect(write.status).toBe(403);
  });
});

/* THE CRON GATE (transformate WI-5647). The scheduler POSTs /api/cron/baseline with its secret as a Bearer; the route
   checks that secret itself (cron-secret.ts, constant time) or the owner (validateOwner). The gate let no such call
   through: it knows no CRON_SECRET, so it answered 401 first. proxy.ts now hands exactly ONE shape to the route: POST,
   not review mode, no basePath or locale, the exact path, and one plain Bearer token. Everything else keeps the gate.
   RED at the base: T1 only. GREEN at the base and the tip, as controls: T2, T3, T3a, T3c, T4, T5, T6b, T8. */
describe("proxy: the cron route gate (transformate WI-5647)", () => {
  const CRON_PATH = "/api/cron/baseline";
  const CRON_BEARER = "Bearer cron-test-not-a-credential";
  const GATE_401 = JSON.stringify({ error: "Unauthorized" });

  /** The gate's refusal: exactly 401 and exactly the gate's body (never the route's text). */
  async function expectGate401(res: Response) {
    expect(res.status).toBe(401);
    expect(await res.text()).toBe(GATE_401);
  }

  it("T1 POST /api/cron/baseline with a plain Bearer and no cookie passes the gate to the route", async () => {
    const res = await proxy(request(CRON_PATH, { method: "POST", headers: { authorization: CRON_BEARER } }));
    // One object, so a failure shows every field (the base reads 401 with the gate's body).
    expect({
      status: res.status,
      body: await res.text(),
      next: res.headers.get("x-middleware-next"),
      location: res.headers.get("location"),
      setCookie: res.headers.getSetCookie(),
      dbCalls: mockQuery.mock.calls.length,
    }).toEqual({ status: 200, body: "", next: "1", location: null, setCookie: [], dbCalls: 0 });
  });

  it("T2 POST /api/cron/baseline with no Authorization header and no cookie: the gate's 401", async () => {
    const res = await proxy(request(CRON_PATH, { method: "POST" }));
    await expectGate401(res);
  });

  it.each([
    "/api/cron/baseline/",
    "/api/cron/baseline.",
    "/api/cron/other",
    "/api/cron",
    "/api/cron/%62aseline",
    "/api//cron/baseline",
  ])("T3 POST %s with the T1 Bearer is not the exact path: the gate's 401", async (path) => {
    const req = request(path, { method: "POST", headers: { authorization: CRON_BEARER } });
    expect(req.nextUrl.pathname).toBe(path);
    await expectGate401(await proxy(req));
  });

  // These two do not start with "/api/", so the gate refuses them as a page: the /login redirect (proxy.ts :147-:150).
  it.each(["/API/CRON/BASELINE", "//api/cron/baseline"])(
    "T3 POST %s with the T1 Bearer is not the exact path: the gate's /login redirect",
    async (path) => {
      const req = request(path, { method: "POST", headers: { authorization: CRON_BEARER } });
      expect(req.nextUrl.pathname).toBe(path);
      const res = await proxy(req);
      expect(res.status).toBe(307);
      expect(res.headers.get("location")).toBe("https://arkon.test/login");
      expect(res.headers.get("x-middleware-next")).toBeNull();
    },
  );

  it.each([
    ["an empty Bearer", "Bearer "],
    ["a whitespace Bearer", "Bearer    "],
    ["a lowercase scheme", "bearer cron-test-not-a-credential"],
    ["another scheme", "Basic cron-test-not-a-credential"],
  ])("T3a POST /api/cron/baseline with %s: the gate's 401", async (_name, authorization) => {
    const res = await proxy(request(CRON_PATH, { method: "POST", headers: { authorization } }));
    await expectGate401(res);
  });

  it("T3a POST /api/cron/baseline with two Authorization headers (one joined value with a comma): the gate's 401", async () => {
    const req = request(CRON_PATH, {
      method: "POST",
      headers: [
        ["authorization", "Bearer QZX5647MARK-a"],
        ["authorization", "Bearer QZX5647MARK-b"],
      ],
    });
    expect(req.headers.get("authorization")).toBe("Bearer QZX5647MARK-a, Bearer QZX5647MARK-b");
    await expectGate401(await proxy(req));
  });

  it.each(["GET", "HEAD", "OPTIONS", "PUT", "PATCH", "DELETE"])(
    "T3c %s /api/cron/baseline with the T1 Bearer: the gate's 401",
    async (method) => {
      const res = await proxy(request(CRON_PATH, { method, headers: { authorization: CRON_BEARER } }));
      await expectGate401(res);
    },
  );

  it("T4 POST /api/audit (a dashboard path) with the T1 Bearer: the gate's 401", async () => {
    const res = await proxy(request("/api/audit", { method: "POST", headers: { authorization: CRON_BEARER } }));
    await expectGate401(res);
  });

  it("T5 POST /api/cron/baseline with a valid session cookie, no Bearer and no CSRF token: the CSRF 403", async () => {
    const res = await proxy(request(CRON_PATH, { method: "POST", cookies: { mc_auth: "valid-session" } }));
    expect(res.status).toBe(403);
    expect(await res.text()).toBe(JSON.stringify({ error: "CSRF validation failed" }));
  });

  it("T6b POST /api/mcp/proxy/x with the T1 Bearer still passes the MCP gateway branch", async () => {
    const res = await proxy(request("/api/mcp/proxy/x", { method: "POST", headers: { authorization: CRON_BEARER } }));
    expect(res.status).toBe(200);
    expect(res.headers.get("x-middleware-next")).toBe("1");
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("T8 review mode on: POST /api/cron/baseline with the T1 Bearer reads as at the base (the review CSRF pass)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    try {
      const res = await proxy(request(CRON_PATH, {
        method: "POST",
        headers: { authorization: CRON_BEARER, cookie: "arkon_review_mode=1" },
      }));
      expect(res.status).toBe(200);
      expect(res.headers.get("x-middleware-next")).toBe("1");
      expect(mockQuery).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
