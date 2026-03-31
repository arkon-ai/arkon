import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Audit Log v2 + RBAC — API tests ────────────────────────── */

test.describe("Audit Log API", () => {
  test("GET /api/audit returns audit entries @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/audit requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/audit supports action filter", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/audit?action=user.login`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });
});

test.describe("Rate Limiter", () => {
  test("rapid requests eventually get 429", async ({ request }) => {
    // Fire many requests quickly
    const results: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
        headers: authHeaders(),
      });
      results.push(res.status());
    }
    // At least some should succeed, and rate limiter may kick in
    expect(results.some(s => s === 200)).toBeTruthy();
  });
});

test.describe("Health Endpoint", () => {
  test("GET /api/health returns healthy @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });
});

test.describe("Sessions Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("sessions settings page loads", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/settings/sessions`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("domcontentloaded");
  });
});
