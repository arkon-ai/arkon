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
  // Note: a raw "/foo/../icon.svg"-style string still matches (suffix-only check) —
  // not asserted false here because NextRequest.nextUrl.pathname is already
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
