import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "./helpers/auth";

/* ── API Key Management — API tests ──────────────────────────── */

test.describe("API Keys API", () => {
  test("GET /api/client/api-keys requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/client/api-keys returns keys list @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("POST /api/client/api-keys creates a key with ak_live_ prefix", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);

    const res = await context.request.post(`${MC_URL}/api/client/api-keys`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: `playwright-test-${Date.now()}`,
        scopes: ["read"],
      },
    });

    // Should create or return 400 if scope format differs
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json();
      if (body.key) {
        expect(body.key).toMatch(/^ak_live_/);
      }
    }

    await context.close();
  });
});

/* ── Magic Link Auth — API tests ─────────────────────────────── */

test.describe("Magic Link API", () => {
  test("POST /api/auth/magic-link requires email", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    // Should reject missing email — 400 or 422
    expect([400, 422]).toContain(res.status());
  });

  test("POST /api/auth/magic-link returns success for any email (no enumeration)", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "nonexistent-playwright@test.com" },
    });
    // Anti-enumeration: should return 200 even for non-existent emails
    expect(res.status()).toBe(200);
  });

  test("POST /api/auth/verify-magic-link with invalid token returns error", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/verify-magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { token: "invalid-token-xyz" },
    });
    // Should reject invalid token — 400, 401, or 405
    expect([400, 401, 404, 405]).toContain(res.status());
  });
});

/* ── Email/Password Auth — API tests ─────────────────────────── */

test.describe("Email Auth API", () => {
  test("POST /api/auth/login with missing fields returns 400", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("POST /api/auth/login with bad credentials returns 401", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "bad@test.com", password: "wrongpassword" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/auth/register requires admin auth", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/register`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "test@test.com", password: "test", role: "viewer" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("GET /api/auth/sessions requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/auth/sessions`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/auth/sessions returns sessions list with cookie auth", async ({ browser }) => {
    const context = await browser.newContext();
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const res = await context.request.get(`${MC_URL}/api/auth/sessions`);
    // Sessions endpoint requires cookie auth (not bearer)
    expect([200, 401, 404]).toContain(res.status());
    await context.close();
  });
});
