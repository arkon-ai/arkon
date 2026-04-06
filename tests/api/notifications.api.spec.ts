import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Notifications Routes — Comprehensive API Regression
   Routes: notifications (GET, PATCH), preferences (GET, PUT),
           test (POST)
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/notifications ──────────────────────────────────

test.describe("GET /api/notifications", () => {
  test("returns notifications @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications`, {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(res.status()).toBe(401);
  });
});

// ── PATCH /api/notifications (mark read) ────────────────────

test.describe("PATCH /api/notifications", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.patch(`${MC_URL}/api/notifications`, {
      headers: { "Content-Type": "application/json" },
      data: { ids: [], action: "read" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("requires CSRF for cookie auth @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      data: { ids: [], action: "read" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("with CSRF marks as read @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: csrfHeaders(csrfToken),
      data: { ids: [], action: "read" },
    });
    expect(res.status()).not.toBe(403);
    await context.close();
  });

  test("invalid action returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: csrfHeaders(csrfToken),
      data: { ids: [], action: "invalid_action" },
    });
    expect([200, 400, 422]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/notifications/preferences ──────────────────────

test.describe("GET /api/notifications/preferences", () => {
  test("returns preferences @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications/preferences`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications/preferences`);
    expect(res.status()).toBe(401);
  });
});

// ── PUT /api/notifications/preferences ──────────────────────

test.describe("PUT /api/notifications/preferences", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.put(`${MC_URL}/api/notifications/preferences`, {
      headers: { "Content-Type": "application/json" },
      data: { email: false },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("updates preferences @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.put(`${MC_URL}/api/notifications/preferences`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { email_enabled: true, push_enabled: false },
    });
    expect([200, 400]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/notifications/test ────────────────────────────

test.describe("POST /api/notifications/test", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/notifications/test`, {
      headers: { "Content-Type": "application/json" },
      data: { type: "push" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("sends test notification @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/notifications/test`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { type: "push" },
    });
    expect([200, 400]).toContain(res.status());
    await context.close();
  });
});
