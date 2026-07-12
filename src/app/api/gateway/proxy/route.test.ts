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

  it("forwards an allowlisted path for the owner with the server GATEWAY_TOKEN", async () => {
    const res = await POST(request({ path: "/api/system-event", body: { text: "hi" } }, "owner-secret"));

    expect(res.status).toBe(200);
    // fetch receives a URL object; assert on the resolved href AND the token —
    // attaching the server GATEWAY_TOKEN is the amplification property the
    // owner-only gate exists to contain, so the happy path must lock it.
    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(calledUrl)).toBe("https://gateway.test/api/system-event");
    expect(init).toEqual(
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({
          Authorization: "Bearer gateway-secret",
        }),
      }),
    );
  });

  it("does not follow a gateway redirect (would re-send GATEWAY_TOKEN past the allowlist)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: "https://gateway.test/api/admin/secrets" } }),
    );

    const res = await POST(request({ path: "/api/system-event", body: { text: "hi" } }, "owner-secret"));

    expect(res.status).toBe(502);
    // Exactly one hop: the allowlisted URL. No second fetch to the redirect target.
    expect(vi.mocked(fetch).mock.calls).toHaveLength(1);
    const body = await res.json();
    expect(body.error).toBe("Gateway redirect blocked");
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

  it("rejects literal path traversal that fetch would normalize out of the allowlist", async () => {
    const res = await POST(request({ path: "/api/system-event/../admin/secrets" }, "owner-secret"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    // WHATWG-collapsed forms (dot-encoded, slash literal)
    ["/api/system-event/%2e%2e/admin/secrets"],
    ["/api/system-event/%2E%2E/admin/secrets"],
    ["/api/system-event/.%2e/admin/secrets"],
    ["/hooks/agent/%2e%2e/%2e%2e/admin"],
    // Encoded-slash forms WHATWG leaves as one segment (the R3 residual) — the
    // downstream gateway would decode %2f→/ and normalize ../ back out of the allowlist.
    ["/api/system-event/%2e%2e%2fadmin"],
    ["/api/system-event/..%2fadmin/secrets"],
    ["/hooks/agent/..%2f..%2fadmin"],
    // Double-encoded
    ["/api/system-event/%252e%252e/admin/secrets"],
  ])("rejects any percent-encoded path %s (no legit gateway path needs encoding)", async (p) => {
    const res = await POST(request({ path: p }, "owner-secret"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a path that repoints the request off the gateway origin", async () => {
    const res = await POST(request({ path: "http://evil.example/api/system-event" }, "owner-secret"));

    expect(res.status).toBe(403);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("allows a true path-segment child of an allowlisted prefix", async () => {
    const res = await POST(request({ path: "/hooks/agent/ping" }, "owner-secret"));

    expect(res.status).toBe(200);
    const [calledUrl, init] = vi.mocked(fetch).mock.calls[0];
    expect(String(calledUrl)).toBe("https://gateway.test/hooks/agent/ping");
    expect(init).toEqual(
      expect.objectContaining({
        redirect: "manual",
        headers: expect.objectContaining({
          Authorization: "Bearer gateway-secret",
        }),
      }),
    );
  });
});
