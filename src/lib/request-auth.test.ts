import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { resolveRequestCredential } from "./request-auth";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function req(opts: { bearer?: string; cookies?: Record<string, string> }) {
  const headers = opts.bearer ? { authorization: `Bearer ${opts.bearer}` } : undefined;
  const r = new NextRequest("https://arkon.test/api/x", headers ? { headers } : undefined);
  for (const [k, v] of Object.entries(opts.cookies ?? {})) r.cookies.set(k, v);
  return r;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.MC_AGENT_TOKENS = "";
});

describe("resolveRequestCredential", () => {
  it("maps a tenant_user session to the viewer role", async () => {
    mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (String(sql).includes("JOIN user_sessions") && (params as unknown[])?.[0] === hash("sess")) {
        return { rows: [{ id: 3, email: "u@t.test", role: "tenant_user", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ cookies: { mc_auth: "sess" } }));
    expect(cred?.type).toBe("user_session");
    expect(cred?.role).toBe("viewer");
    expect(cred?.tenant_id).toBe("tenant-a");
  });

  it("resolves MC_ADMIN_TOKEN to an owner credential with wildcard tenant", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const cred = await resolveRequestCredential(req({ bearer: "owner-secret" }));
    expect(cred?.role).toBe("owner");
    expect(cred?.tenant_id).toBe("*");
  });

  // Pins the constantTimeEqual sha256 fix (WI-1346 finding #5): a long token
  // sharing the admin token's first 64 chars must NOT authenticate as owner.
  it("does NOT accept a long token sharing the admin token's first 64 characters", async () => {
    const prefix = "a".repeat(64);
    process.env.MC_ADMIN_TOKEN = `${prefix}X`;
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const cred = await resolveRequestCredential(req({ bearer: `${prefix}Y` }));
    expect(cred).toBeNull();
  });

  // Pins the agent-token role clamp (WI-1346 finding #6): an agent token must
  // never resolve to the fleet-owner role.
  it("downgrades an agent token whose row says 'owner' to the agent role", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM agents WHERE token_hash")) {
        return { rows: [{ id: "agent-x", role: "owner", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ bearer: "agent-bearer" }));
    expect(cred?.type).toBe("agent_token");
    expect(cred?.role).toBe("agent"); // never fleet-owner via an agent token
  });

  it("passes an owner-provisioned tenant-scoped agent role (admin) through unchanged", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM agents WHERE token_hash")) {
        return { rows: [{ id: "agent-y", role: "admin", tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ bearer: "agent-bearer-2" }));
    expect(cred?.role).toBe("admin"); // contained by per-tenant route gates (WI-1346 #1)
  });

  it("accepts an ak_live_ api key as an agent credential bound to its tenant", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM api_keys")) {
        return { rows: [{ id: 11, tenant_id: "tenant-a" }] } as never;
      }
      return { rows: [] } as never;
    });
    const cred = await resolveRequestCredential(req({ bearer: "ak_live_abc123" }));
    expect(cred?.type).toBe("api_key");
    expect(cred?.role).toBe("agent");
    expect(cred?.tenant_id).toBe("tenant-a");
  });

  it("an unknown bearer with no session/admin/agent match resolves to null", async () => {
    mockQuery.mockResolvedValue({ rows: [] } as never);
    const cred = await resolveRequestCredential(req({ bearer: "totally-unknown" }));
    expect(cred).toBeNull();
  });
});
