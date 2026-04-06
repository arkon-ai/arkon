import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Compliance Routes — Comprehensive API Regression
   Routes: compliance/audit-log, compliance/export,
           compliance/purge
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/compliance/audit-log ───────────────────────────

test.describe("GET /api/compliance/audit-log", () => {
  test("returns audit entries @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/audit-log`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/audit-log`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/audit-log`, {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/compliance/audit-log ──────────────────────────

test.describe("POST /api/compliance/audit-log", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/compliance/audit-log`, {
      headers: { "Content-Type": "application/json" },
      data: { action: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ── GET /api/compliance/export ─────────────────���────────────

test.describe("GET /api/compliance/export", () => {
  test("returns export data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/export`, {
      headers: authHeaders(),
    });
    expect([200, 400]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/export`);
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/compliance/purge (GDPR) ──────────────────────

test.describe("POST /api/compliance/purge", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/compliance/purge`, {
      headers: { "Content-Type": "application/json" },
      data: { confirm: true },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("requires confirmation @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/compliance/purge`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {},
    });
    // Without confirm flag, should reject
    expect([400, 422]).toContain(res.status());
    await context.close();
  });
});
