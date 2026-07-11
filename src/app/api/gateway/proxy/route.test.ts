import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { query } from "@/lib/db";
import { POST } from "./route";

vi.mock("@/lib/db", () => ({ query: vi.fn() }));

const mockQuery = vi.mocked(query);

function request(body: Record<string, unknown>, token?: string) {
  return new NextRequest("https://arkon.test/api/gateway/proxy", {
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
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
  process.env.MC_ADMIN_TOKEN = "owner-secret";
  process.env.GATEWAY_URL = "https://gateway.test";
  process.env.GATEWAY_TOKEN = "gateway-secret";
  mockQuery.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("JOIN user_sessions") && params?.[0] === hash("admin-session")) {
      return { rows: [{ id: 6, email: "admin@example.com", role: "admin", tenant_id: "transformate" }] } as never;
    }
    return { rows: [] } as never;
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("gateway proxy authorization (owner-only, ARKON-01 / WI-1699)", () => {
  it("rejects unauthenticated calls with 401 and never reaches the gateway", async () => {
    const res = await POST(request({ path: "/api/system-event", body: { text: "hi" } }));

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects tenant-scoped admins with 403 — proxy attaches the server GATEWAY_TOKEN", async () => {
    const res = await POST(request({ path: "/api/system-event", body: { text: "hi" } }, "admin-session"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards an allowlisted path for the owner", async () => {
    const res = await POST(request({ path: "/api/system-event", body: { text: "hi" } }, "owner-secret"));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://gateway.test/api/system-event",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("rejects non-allowlisted paths even for the owner", async () => {
    const res = await POST(request({ path: "/api/admin/secrets" }, "owner-secret"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects prefix-sibling paths (startsWith bypass)", async () => {
    const res = await POST(request({ path: "/api/system-event-backdoor" }, "owner-secret"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects path traversal that fetch would normalize out of the allowlist", async () => {
    const res = await POST(request({ path: "/api/system-event/../admin/secrets" }, "owner-secret"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a true path-segment child of an allowlisted prefix", async () => {
    const res = await POST(request({ path: "/hooks/agent/ping" }, "owner-secret"));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(
      "https://gateway.test/hooks/agent/ping",
      expect.objectContaining({ method: "POST" })
    );
  });
});
