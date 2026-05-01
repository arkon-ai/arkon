import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function request(body: Record<string, unknown>, token?: string) {
  return new NextRequest("https://arkon.test/api/gateway/probe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function hash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ version: "ok" })));
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  delete process.env.MC_GATEWAY_PROBE_ALLOWLIST;
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash("viewer-session")) {
      return { rows: [{ id: 5, email: "viewer@example.com", role: "viewer", tenant_id: "transformate" }] } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway probe authorization and target validation", () => {
  it("rejects unauthenticated probes", async () => {
    const res = await POST(request({ host: "example.com", port: 443 }));

    expect(res.status).toBe(403);
  });

  it("rejects non-admin credentials", async () => {
    process.env.MC_AGENT_TOKENS = "agent-1:agent-secret";
    const res = await POST(request({ host: "example.com", port: 443 }, "agent-secret"));

    expect(res.status).toBe(403);
  });

  it("rejects authenticated non-admin users", async () => {
    const res = await POST(request({ host: "example.com", port: 443 }, "viewer-session"));

    expect(res.status).toBe(403);
  });

  it("rejects loopback targets unless explicitly allowlisted", async () => {
    const res = await POST(request({ host: "127.0.0.1", port: 3000 }, "owner-secret"));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/not allowed/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows explicitly allowlisted internal targets", async () => {
    process.env.MC_GATEWAY_PROBE_ALLOWLIST = "127.0.0.1:3000";
    const res = await POST(request({ host: "127.0.0.1", port: 3000 }, "owner-secret"));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/health",
      expect.objectContaining({ redirect: "manual" })
    );
  });
});
