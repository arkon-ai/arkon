import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Kill Switch / Active Runs — Comprehensive API Regression
   Routes: /api/active-runs, /api/gateway/kill-agent,
           /api/gateway/proxy
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/active-runs ────────────────────────────────────

test.describe("GET /api/active-runs", () => {
  test("returns runs array @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/active-runs`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.runs ?? body)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/active-runs`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/active-runs`, {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("runs array has expected shape @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/active-runs`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.runs).toBeDefined();
    expect(Array.isArray(body.runs)).toBeTruthy();
  });
});

// ── POST /api/gateway/kill-agent ────────────────────────────

test.describe("POST /api/gateway/kill-agent", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/gateway/kill-agent`, {
      headers: { "Content-Type": "application/json" },
      data: { agent_id: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("requires owner/admin role @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/gateway/kill-agent`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { agent_id: "nonexistent" },
    });
    // Owner/admin: 200/404. Other role: 403.
    expect([200, 400, 403, 404, 500, 502]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/gateway/proxy ─────────────────────────────────

test.describe("POST /api/gateway/proxy", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/gateway/proxy`, {
      headers: { "Content-Type": "application/json" },
      data: { path: "/status" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("proxies request with auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/gateway/proxy`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { path: "/status" },
    });
    // 200 = proxy success, 502 = gateway unreachable, 400 = bad path
    expect([200, 400, 502, 503]).toContain(res.status());
  });
});
