import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authenticate, csrfHeaders } from "./helpers/auth";

test.describe("Auth", () => {
  test("POST /api/auth/init with valid token returns 200", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.role).toBeDefined();
  });

  test("POST /api/auth/init with bad token returns 401", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: "Bearer bad-token-xyz" },
    });
    expect(res.status()).toBe(401);
  });

  test("POST /api/auth/init with no token returns 401", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`);
    expect(res.status()).toBe(401);
  });

  test("auth sets mc_auth cookie", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("mc_auth");
  });

  test("auth sets mc_csrf cookie", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const cookieHeader = res.headers()["set-cookie"] ?? "";
    expect(cookieHeader).toContain("mc_csrf");
  });

  test("authenticate helper returns CSRF token", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    expect(csrfToken).toBeTruthy();
    expect(csrfToken.length).toBeGreaterThan(0);
    await context.close();
  });

  test("cookie-based GET works without CSRF header", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    // GET is exempt from CSRF — cookies alone should suffice
    const res = await context.request.get(`${MC_URL}/api/dashboard/overview`);
    expect([200, 429]).toContain(res.status());
    await context.close();
  });

  test("cookie-based mutation with CSRF token succeeds", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    // PATCH requires CSRF token as x-csrf-token header
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: csrfHeaders(csrfToken),
      data: { ids: [], action: "read" },
    });
    // Should pass CSRF check — not 403
    expect(res.status()).not.toBe(403);
    await context.close();
  });

  test("cookie-based mutation without CSRF token returns 403", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    // PATCH without x-csrf-token header should fail CSRF check
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      data: { ids: [], action: "read" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("protected route without auth returns 401", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`);
    // Allow 401 or 429 (rate limit is expected under parallel test load)
    expect([401, 429]).toContain(res.status());
  });

  test("protected route with valid token returns 200", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    // Allow 200 or 429 (rate limit under parallel test load)
    expect([200, 429]).toContain(res.status());
  });
});
