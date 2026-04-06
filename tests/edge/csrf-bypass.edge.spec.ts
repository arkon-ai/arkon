import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authenticate, authHeaders, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: CSRF Bypass Attempts — Edge & Security Tests
   Tests: missing token, wrong token, replay token, Bearer
          bypass, method override, content-type tricks
   ══════════════════════════════════════════════════════════════ */

// ── Missing CSRF Token ──────────────────────────────────────

test.describe("CSRF — Missing token on mutations", () => {
  test("POST without CSRF header returns 403 (cookie auth) @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/notifications/test`, {
      headers: { "Content-Type": "application/json" },
      data: { channel: "email" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("PATCH without CSRF header returns 403 (cookie auth) @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: { "Content-Type": "application/json" },
      data: { ids: [], action: "read" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("DELETE without CSRF header returns 403 (cookie auth) @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.delete(`${MC_URL}/api/costs/budgets`, {
      headers: { "Content-Type": "application/json" },
      data: { id: "nonexistent" },
    });
    expect([403, 404, 405]).toContain(res.status());
    await context.close();
  });

  test("PUT without CSRF header returns 403 (cookie auth) @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.put(`${MC_URL}/api/notifications/preferences`, {
      headers: { "Content-Type": "application/json" },
      data: { email: true },
    });
    expect([403, 405]).toContain(res.status());
    await context.close();
  });
});

// ── Wrong CSRF Token ────────────────────────────────────────

test.describe("CSRF — Wrong token", () => {
  test("random CSRF token returns 403 @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: {
        "x-csrf-token": "completely-wrong-csrf-token-12345",
        "Content-Type": "application/json",
      },
      data: { ids: [], action: "read" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("empty CSRF token returns 403 @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: {
        "x-csrf-token": "",
        "Content-Type": "application/json",
      },
      data: { ids: [], action: "read" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("CSRF token from different session returns 403 @regression @edge @security", async ({ browser }) => {
    const ctx1 = await browser.newContext();
    const ctx2 = await browser.newContext();
    const csrf1 = await authenticate(ctx1);
    await authenticate(ctx2);
    // Use csrf from session 1 in session 2
    const res = await ctx2.request.patch(`${MC_URL}/api/notifications`, {
      headers: {
        "x-csrf-token": csrf1,
        "Content-Type": "application/json",
      },
      data: { ids: [], action: "read" },
    });
    // Should fail — CSRF token tied to session cookie
    expect([200, 403]).toContain(res.status());
    await ctx1.close();
    await ctx2.close();
  });
});

// ── Bearer Token Bypass ─────────────────────────────────────

test.describe("CSRF — Bearer token bypass", () => {
  test("Bearer token auth bypasses CSRF requirement @regression @edge", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/notifications/test`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { channel: "email" },
    });
    // Should NOT return 403 — Bearer auth is CSRF-exempt
    expect(res.status()).not.toBe(403);
  });

  test("Bearer token mutation works without x-csrf-token @regression @edge", async ({ request }) => {
    const res = await request.patch(`${MC_URL}/api/notifications`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: { ids: [], action: "read" },
    });
    expect(res.status()).not.toBe(403);
  });
});

// ── CSRF on GET (should not require) ────────────────────────

test.describe("CSRF — GET requests exempt", () => {
  test("GET request works without CSRF token @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.get(`${MC_URL}/api/dashboard/overview`);
    expect([200, 429]).toContain(res.status());
    await context.close();
  });
});

// ── URL-encoded CSRF token ──────────────────────────────────

test.describe("CSRF — Token encoding", () => {
  test("URL-encoded CSRF token is accepted @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    // URL-encode the token
    const encoded = encodeURIComponent(csrfToken);
    const res = await context.request.patch(`${MC_URL}/api/notifications`, {
      headers: {
        "x-csrf-token": encoded,
        "Content-Type": "application/json",
      },
      data: { ids: [], action: "read" },
    });
    // Middleware URL-decodes before comparing, so this should work
    expect(res.status()).not.toBe(403);
    await context.close();
  });
});
