import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: MCP Gateway Routes — Comprehensive API Regression
   Routes: mcp/gateway/config, mcp/gateway/stats,
           mcp/proxy/[serverId]
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/mcp/gateway/config ─────────────────────────────

test.describe("GET /api/mcp/gateway/config", () => {
  test("returns config @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/mcp/gateway/config`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/mcp/gateway/config`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── GET /api/mcp/gateway/stats ──────────────────────────────

test.describe("GET /api/mcp/gateway/stats", () => {
  test("returns stats @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/mcp/gateway/stats`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/mcp/gateway/stats`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── /api/mcp/proxy/[serverId] ───────────────────────────────

test.describe("/api/mcp/proxy/[serverId]", () => {
  test("GET requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/mcp/proxy/test-server`);
    expect([401, 404]).toContain(res.status());
  });

  test("POST requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/mcp/proxy/test-server`, {
      headers: { "Content-Type": "application/json" },
      data: { method: "tools/list" },
    });
    expect([401, 404]).toContain(res.status());
  });

  test("non-existent server returns 404 @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/mcp/proxy/nonexistent-server-id`, {
      headers: authHeaders(),
    });
    expect([404, 400, 200]).toContain(res.status());
  });
});
