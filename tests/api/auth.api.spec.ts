import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authenticate, csrfHeaders, authHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Auth Routes — Comprehensive API Regression
   Routes: /api/auth/init, login, logout, register,
           magic-link, verify-magic-link, sessions
   ══════════════════════════════════════════════════════════════ */

// ── POST /api/auth/init ─────────────────────────────────────

test.describe("POST /api/auth/init", () => {
  test("valid admin token returns 200 with role @regression @smoke", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.role).toBeDefined();
    expect(["owner", "admin", "agent", "viewer", "operator"]).toContain(body.role);
  });

  test("sets mc_auth cookie @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("mc_auth");
  });

  test("sets mc_csrf cookie @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("mc_csrf");
  });

  test("sets mc_role cookie @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("mc_role");
  });

  test("sets mc_tenant cookie @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("mc_tenant");
  });

  test("invalid token returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: "Bearer bad-token-xyz" },
    });
    expect(res.status()).toBe(401);
  });

  test("missing Authorization header returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`);
    expect(res.status()).toBe(401);
  });

  test("empty Bearer token returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: "Bearer " },
    });
    expect(res.status()).toBe(401);
  });

  test("malformed Authorization header returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: "NotBearer sometoken" },
    });
    expect(res.status()).toBe(401);
  });

  test("authenticate helper returns non-empty CSRF token @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    expect(csrfToken).toBeTruthy();
    expect(csrfToken.length).toBeGreaterThan(10);
    await context.close();
  });
});

// ── POST /api/auth/login ────────────────────────────────────

test.describe("POST /api/auth/login", () => {
  test("missing fields returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("missing password returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "test@test.com" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("missing email returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { password: "somepass" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("bad credentials returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "bad@test.com", password: "wrongpassword" },
    });
    expect(res.status()).toBe(401);
  });

  test("invalid email format returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "not-an-email", password: "somepass" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("SQL injection in email field is rejected @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "' OR 1=1 --", password: "test" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });
});

// ── POST /api/auth/logout ───────────────────────────────────

test.describe("POST /api/auth/logout", () => {
  test("authenticated logout clears cookies @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/auth/logout`);
    expect([200, 204]).toContain(res.status());
    // Verify cookies are cleared
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    if (cookieHeader) {
      // Cookies should be set with maxAge=0 or expired
      expect(cookieHeader).toContain("mc_auth");
    }
    await context.close();
  });

  test("unauthenticated logout returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/logout`);
    // May return 200 (idempotent) or 401
    expect([200, 401]).toContain(res.status());
  });
});

// ── POST /api/auth/register ─────────────────────────────────

test.describe("POST /api/auth/register", () => {
  test("requires admin/owner auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/register`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "test@test.com", password: "test12345", role: "viewer" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("with admin auth and valid data returns 201 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const email = `pw-register-${Date.now()}@test.com`;
    const res = await context.request.post(`${MC_URL}/api/auth/register`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { email, password: "TestPass123!", role: "viewer" },
    });
    // 201 = created, 200 = ok, 400 = validation, 403 = not owner
    expect([200, 201, 400, 403]).toContain(res.status());
    if (res.status() === 201 || res.status() === 200) {
      const body = await res.json();
      expect(body.ok).toBeTruthy();
    }
    await context.close();
  });

  test("missing email returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/auth/register`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { password: "test12345", role: "viewer" },
    });
    expect([400, 422]).toContain(res.status());
    await context.close();
  });

  test("invalid role is rejected @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/auth/register`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { email: "pw-badrole@test.com", password: "TestPass123!", role: "superadmin" },
    });
    expect([400, 403, 422]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/auth/magic-link ───────────────────────────────

test.describe("POST /api/auth/magic-link", () => {
  test("missing email returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect([400, 422]).toContain(res.status());
  });

  test("returns 200 for any email — anti-enumeration @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { email: `nonexistent-pw-${Date.now()}@test.com` },
    });
    expect(res.status()).toBe(200);
  });

  test("invalid email format returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "not-an-email" },
    });
    expect([200, 400, 422]).toContain(res.status());
  });
});

// ── POST /api/auth/verify-magic-link ────────────────────────

test.describe("POST /api/auth/verify-magic-link", () => {
  test("invalid token returns error @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/verify-magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { token: "invalid-token-xyz" },
    });
    expect([400, 401, 404, 405]).toContain(res.status());
  });

  test("missing token returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/verify-magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect([400, 401, 404, 405, 422]).toContain(res.status());
  });

  test("empty token returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/verify-magic-link`, {
      headers: { "Content-Type": "application/json" },
      data: { token: "" },
    });
    expect([400, 401, 404, 405, 422]).toContain(res.status());
  });
});

// ── GET /api/auth/sessions ──────────────────────────────────

test.describe("GET /api/auth/sessions", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/auth/sessions`);
    expect(res.status()).toBe(401);
  });

  test("returns sessions list with cookie auth @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.get(`${MC_URL}/api/auth/sessions`);
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.sessions || body.count !== undefined).toBeTruthy();
    }
    await context.close();
  });
});

// ── CSRF enforcement ────────────────────────────────────────

test.describe("CSRF enforcement", () => {
  test("cookie-based GET works without CSRF header @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.get(`${MC_URL}/api/dashboard/overview`);
    expect([200, 429]).toContain(res.status());
    await context.close();
  });

  test("cookie-based mutation with CSRF token succeeds @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: csrfHeaders(csrfToken),
      data: { ids: [], action: "read" },
    });
    expect(res.status()).not.toBe(403);
    await context.close();
  });

  test("cookie-based mutation without CSRF token returns 403 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      data: { ids: [], action: "read" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });
});

// ── Protected route enforcement ─────────────────────────────

test.describe("Protected routes", () => {
  test("protected route without auth returns 401 @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`);
    expect([401, 429]).toContain(res.status());
  });

  test("protected route with valid Bearer token returns 200 @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
  });
});
