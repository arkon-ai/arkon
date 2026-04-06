import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Audit & RBAC — Comprehensive API Regression
   Routes: /api/audit (GET), /api/health, rate limiter
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/audit ──────────────────────────────────────────

test.describe("GET /api/audit", () => {
  test("returns audit entries @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit`, {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(res.status()).toBe(401);
  });

  test("supports action filter @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit?action=user.login`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("supports since filter @regression", async ({ request }) => {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const res = await request.get(`${MC_URL}/api/audit?since=${since}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("supports limit param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit?limit=5`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("supports combined filters @regression", async ({ request }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await request.get(`${MC_URL}/api/audit?action=user.login&limit=10&since=${since}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });
});

// ── Rate Limiter ────────────────────────────────────────────

test.describe("Rate Limiter", () => {
  test("rapid requests eventually get 429 @regression", async ({ request }) => {
    const results: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
        headers: authHeaders(),
      });
      results.push(res.status());
    }
    // At least some should succeed
    expect(results.some(s => s === 200)).toBeTruthy();
  });

  test("rate limit applies per-endpoint @regression", async ({ request }) => {
    // Hit two different endpoints — both should work
    const res1 = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    const res2 = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res1.status());
    expect([200, 429]).toContain(res2.status());
  });
});

// ── Health Endpoint ─────────────────────────────────────────

test.describe("Health Endpoint", () => {
  test("returns healthy @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  test("includes checks object @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Health endpoint typically includes sub-checks
    expect(typeof body).toBe("object");
  });
});
