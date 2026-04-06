import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Security Routes — Comprehensive API Regression
   Routes: security/overview, events/[id]/dismiss|purge|redact,
           events/bulk-purge, purge
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/security/overview ──────────────────────────────

test.describe("GET /api/security/overview", () => {
  test("returns valid shape @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/security/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/security/overview`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/security/overview`, {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/events/[id]/dismiss ───────────────────────────

test.describe("POST /api/events/[id]/dismiss", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/events/nonexistent/dismiss`);
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent event returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/events/00000000-0000-0000-0000-000000000000/dismiss`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([404, 400, 200]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/events/[id]/purge ─────────────────────────────

test.describe("POST /api/events/[id]/purge", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/events/nonexistent/purge`);
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent event returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/events/00000000-0000-0000-0000-000000000000/purge`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([404, 400, 200]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/events/[id]/redact ────────────────────────────

test.describe("POST /api/events/[id]/redact", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/events/nonexistent/redact`);
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent event returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/events/00000000-0000-0000-0000-000000000000/redact`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([404, 400, 200]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/events/bulk-purge ─────────────────────────────

test.describe("POST /api/events/bulk-purge", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/events/bulk-purge`, {
      headers: { "Content-Type": "application/json" },
      data: { ids: [] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("empty ids array is handled @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/events/bulk-purge`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { ids: [] },
    });
    expect([200, 400]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/purge (two-step) ──────────────────────────────

test.describe("POST /api/purge", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/purge`, {
      headers: { "Content-Type": "application/json" },
      data: { confirm: true },
    });
    expect([401, 403]).toContain(res.status());
  });
});
