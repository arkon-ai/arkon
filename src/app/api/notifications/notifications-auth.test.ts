import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { GET, PUT } from "./preferences/route";
import { POST as testNotification } from "./test/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type TestRequestInit = Omit<RequestInit, "signal"> & { cookies?: Record<string, string> };

function request(path: string, init: TestRequestInit = {}) {
  const { cookies, ...requestInit } = init;
  const req = new NextRequest(`https://arkon.test${path}`, requestInit);
  for (const [name, value] of Object.entries(cookies ?? {})) req.cookies.set(name, value);
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash("tenant-admin-session")) {
      return { rows: [{ id: 2, email: "admin@example.com", role: "admin", tenant_id: "tenant-a" }] } as never;
    }
    if (sql.includes("SELECT channel, enabled, config")) {
      return { rows: [{ channel: "slack", enabled: true, config: { webhook_url: "https://hooks.example/secret", label: "ops" } }] } as never;
    }
    if (sql.includes("SELECT enabled, config")) {
      return { rows: [{ enabled: true, config: { webhook_url: "https://hooks.example/secret" } }] } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("notification preferences auth", () => {
  it("rejects unauthenticated preference reads", async () => {
    const res = await GET(request("/api/notifications/preferences"));

    // WI-1849: no credential is 401 (unauthenticated), not 403 (unauthorized) —
    // matches the E2E contract in tests/api/notifications.api.spec.ts.
    expect(res.status).toBe(401);
  });

  it("uses the authenticated tenant and redacts stored secrets on read", async () => {
    const res = await GET(request("/api/notifications/preferences", {
      cookies: { mc_auth: "tenant-admin-session", mc_tenant: "tenant-b" },
    }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls.find(([sql]) => String(sql).includes("notification_preferences"))?.[1]).toEqual(["tenant-a"]);
    expect(body.channels.slack.config.webhook_url).toBe("[redacted]");
    expect(body.channels.slack.config.label).toBe("ops");
  });

  it("rejects cookie-session preference writes without the CSRF header", async () => {
    // WI-1849: the double-submit gate must fail closed, not just pass when fed.
    const res = await PUT(request("/api/notifications/preferences", {
      method: "PUT",
      cookies: { mc_auth: "tenant-admin-session", mc_csrf: "csrf-test-token" },
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ channel: "slack", enabled: true, config: {} }),
    }));

    expect(res.status).toBe(403);
  });

  it("stores preference updates under the authenticated tenant instead of a forged cookie tenant", async () => {
    const res = await PUT(request("/api/notifications/preferences", {
      method: "PUT",
      // WI-1849: cookie-session mutations now need the double-submit CSRF pair.
      cookies: { mc_auth: "tenant-admin-session", mc_tenant: "tenant-b", mc_csrf: "csrf-test-token" },
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-test-token" },
      body: JSON.stringify({ channel: "slack", enabled: true, config: { webhook_url: "https://hooks.example/secret" } }),
    }));

    expect(res.status).toBe(200);
    const upsert = mockQuery.mock.calls.find(([sql]) => String(sql).includes("INSERT INTO notification_preferences"));
    expect(upsert?.[1]?.[0]).toBe("tenant-a");
  });

  it("sends test notifications using the authenticated tenant's config", async () => {
    const res = await testNotification(request("/api/notifications/test", {
      method: "POST",
      // WI-1849: cookie-session mutations now need the double-submit CSRF pair.
      cookies: { mc_auth: "tenant-admin-session", mc_tenant: "tenant-b", mc_csrf: "csrf-test-token" },
      headers: { "content-type": "application/json", "x-csrf-token": "csrf-test-token" },
      body: JSON.stringify({ channel: "slack" }),
    }));

    expect(res.status).toBe(200);
    const lookup = mockQuery.mock.calls.find(([sql]) => String(sql).includes("WHERE tenant_id = $1 AND channel = $2"));
    expect(lookup?.[1]).toEqual(["tenant-a", "slack"]);
    expect(fetch).toHaveBeenCalledWith("https://hooks.example/secret", expect.any(Object));
  });
});
