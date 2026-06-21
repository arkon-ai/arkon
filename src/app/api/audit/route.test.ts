import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { GET } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function req(url: string, opts: { bearer?: string; cookies?: Record<string, string> } = {}) {
  const headers = opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : undefined;
  const r = new NextRequest(url, headers ? { headers } : undefined);
  for (const [k, v] of Object.entries(opts.cookies ?? {})) r.cookies.set(k, v);
  return r;
}

function auditRows() {
  return (sql: string) => {
    if (String(sql).includes("audit_log_v2")) {
      if (String(sql).includes("COUNT(*)")) return { rows: [{ total: 0 }] };
      return { rows: [] };
    }
    return { rows: [] };
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
});

describe("GET /api/audit tenant scope (WI-1346 #1)", () => {
  it("hard-scopes a non-owner admin to their own tenant and ignores a forged ?tenant_id", async () => {
    const rows = auditRows();
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("admin-sess")) {
        return { rows: [{ id: 9, email: "adm@a.test", role: "admin", tenant_id: "tenant-a" }] } as never;
      }
      return rows(sql) as never;
    });

    const res = await GET(req("https://arkon.test/api/audit?tenant_id=tenant-b", { cookies: { mc_auth: "admin-sess" } }));
    expect(res.status).toBe(200);

    const dataCall = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes("FROM audit_log_v2") && !String(sql).includes("COUNT"),
    );
    expect(dataCall).toBeDefined();
    expect(dataCall?.[1]).toContain("tenant-a"); // own tenant forced
    expect(dataCall?.[1]).not.toContain("tenant-b"); // forged param ignored
  });

  it("rejects (401) a credential below admin", async () => {
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("viewer-sess")) {
        return { rows: [{ id: 2, email: "v@a.test", role: "tenant_user", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });

    const res = await GET(req("https://arkon.test/api/audit", { cookies: { mc_auth: "viewer-sess" } }));
    expect(res.status).toBe(401);
  });

  it("lets an owner narrow by ?tenant_id (fleet-wide otherwise)", async () => {
    mockQuery.mockImplementation(async (sql: string) => auditRows()(sql) as never);

    const res = await GET(req("https://arkon.test/api/audit?tenant_id=tenant-x", { bearer: "owner-secret" }));
    expect(res.status).toBe(200);

    const dataCall = mockQuery.mock.calls.find(
      ([sql]) => String(sql).includes("FROM audit_log_v2") && !String(sql).includes("COUNT"),
    );
    expect(dataCall?.[1]).toContain("tenant-x"); // owner CAN narrow to a chosen tenant
  });
});
