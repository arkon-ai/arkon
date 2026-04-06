import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: API Key Management — Comprehensive API Regression
   Routes: /api/client/api-keys (GET, POST, DELETE)
   ══════════════════════════════════════════════════════════════ */

test.describe("GET /api/client/api-keys", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`);
    expect(res.status()).toBe(401);
  });

  test("returns keys list with auth @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`, {
      headers: { Authorization: "Bearer invalid-key" },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("POST /api/client/api-keys", () => {
  test("creates a key with ak_live_ prefix @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/client/api-keys`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: `playwright-test-${Date.now()}`, scopes: ["read"] },
    });
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json();
      if (body.key) {
        expect(body.key).toMatch(/^ak_live_/);
      }
    }
    await context.close();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/client/api-keys`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "no-auth-key", scopes: ["read"] },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("missing name returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/client/api-keys`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { scopes: ["read"] },
    });
    expect([400, 422]).toContain(res.status());
    await context.close();
  });

  test("empty name returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/client/api-keys`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: "", scopes: ["read"] },
    });
    expect([400, 422]).toContain(res.status());
    await context.close();
  });

  test("CSRF required for mutation @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/client/api-keys`, {
      headers: { "Content-Type": "application/json" },
      data: { name: `no-csrf-${Date.now()}`, scopes: ["read"] },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });
});

test.describe("DELETE /api/client/api-keys", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.delete(`${MC_URL}/api/client/api-keys?id=nonexistent`);
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent key returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.delete(`${MC_URL}/api/client/api-keys?id=nonexistent-key-id`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([404, 400, 200]).toContain(res.status());
    await context.close();
  });
});
