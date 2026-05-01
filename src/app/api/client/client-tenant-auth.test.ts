import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { GET as getDashboard } from "./dashboard/route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function request(cookies: Record<string, string>) {
  const req = new NextRequest("https://arkon.test/api/client/dashboard");
  for (const [name, value] of Object.entries(cookies)) req.cookies.set(name, value);
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash("tenant-a-session")) {
      return { rows: [{ id: 1, email: "client@example.com", role: "tenant_user", tenant_id: "tenant-a" }] } as never;
    }
    if (sql.includes("FROM tenants")) {
      return { rows: [{ id: params?.[0], name: "Tenant A", domain: null, plan: "pro", created_at: "now" }] } as never;
    }
    return { rows: [{ active_sessions: "0", cost_24h: "0", tokens_24h: "0", cost_30d: "0", tokens_30d: "0" }] } as never;
  });
});

describe("client portal tenant auth", () => {
  it("ignores a forged mc_tenant cookie and uses the authenticated user's tenant", async () => {
    const res = await getDashboard(request({ mc_auth: "tenant-a-session", mc_tenant: "tenant-b" }));

    expect(res.status).toBe(200);
    const tenantQuery = mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM tenants"));
    expect(tenantQuery?.[1]).toEqual(["tenant-a"]);
  });

  it("rejects a forged tenant cookie without a valid authenticated principal", async () => {
    const res = await getDashboard(request({ mc_tenant: "tenant-b" }));

    expect(res.status).toBe(401);
  });
});
