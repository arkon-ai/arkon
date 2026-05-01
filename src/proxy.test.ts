import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { proxy } from "./proxy";

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
