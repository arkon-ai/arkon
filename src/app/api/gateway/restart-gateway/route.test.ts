import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { GET, POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function request(token?: string, method = "GET") {
  return new NextRequest("https://arkon.test/api/gateway/restart-gateway", {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

const envSnapshot = {
  MC_ADMIN_TOKEN: process.env.MC_ADMIN_TOKEN,
  GATEWAY_SSH_HOST: process.env.GATEWAY_SSH_HOST,
};

function restoreEnv(key: keyof typeof envSnapshot) {
  if (envSnapshot[key] === undefined) delete process.env[key];
  else process.env[key] = envSnapshot[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash("admin-session")) {
      return { rows: [{ id: 6, email: "admin@example.com", role: "admin", tenant_id: "transformate" }] } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  restoreEnv("MC_ADMIN_TOKEN");
  restoreEnv("GATEWAY_SSH_HOST");
});

describe("restart-gateway GET authorization (owner-only, ARKON-01 / WI-1699)", () => {
  it("rejects unauthenticated calls with 401", async () => {
    const res = await GET(request());

    expect(res.status).toBe(401);
  });

  it("rejects tenant-scoped admins with 403 — gateway status reads are owner-only", async () => {
    const res = await GET(request("admin-session"));

    expect(res.status).toBe(403);
  });

  it("lets the owner past the authz gate (reaches config check, 503 without GATEWAY_SSH_HOST)", async () => {
    delete process.env.GATEWAY_SSH_HOST;
    const res = await GET(request("owner-secret"));

    // Not 401/403 — the owner passes authz and reaches the missing-config branch.
    expect(res.status).toBe(503);
  });
});

describe("restart-gateway POST authorization (owner-only, ARKON-01 / WI-1699)", () => {
  it("rejects unauthenticated calls with 401", async () => {
    const res = await POST(request(undefined, "POST"));

    expect(res.status).toBe(401);
  });

  it("rejects tenant-scoped admins with 403 — restarts are owner-only", async () => {
    const res = await POST(request("admin-session", "POST"));

    expect(res.status).toBe(403);
  });

  it("lets the owner past the authz gate (reaches config check, 503 without GATEWAY_SSH_HOST)", async () => {
    delete process.env.GATEWAY_SSH_HOST;
    const res = await POST(request("owner-secret", "POST"));

    expect(res.status).toBe(503);
  });
});
