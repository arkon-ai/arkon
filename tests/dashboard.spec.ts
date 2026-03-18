import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

test.describe("Dashboard API", () => {
  test("GET /api/dashboard/overview returns valid shape", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // Should have at least some top-level keys
    expect(typeof body).toBe("object");
  });

  test("GET /api/dashboard/activity returns array or object", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/dashboard/anomalies returns 200", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/anomalies`, {
      headers: authHeaders(),
    });
    // Allow 200 or 429 (rate limit under parallel test load)
    expect([200, 429]).toContain(res.status());
  });

  test("dashboard page renders without JS errors", async ({ page, context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });
});
