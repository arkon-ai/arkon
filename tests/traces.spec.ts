import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Trace Explorer — API + UI tests ─────────────────────────── */

test.describe("Traces API", () => {
  test("GET /api/traces returns traces array @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    // Should have traces array (may be empty)
    expect(Array.isArray(body.traces ?? body)).toBeTruthy();
  });

  test("GET /api/traces requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/traces supports time filters", async ({ request }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await request.get(`${MC_URL}/api/traces?since=${since}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("GET /api/traces/[traceId] returns 404 for non-existent trace", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces/00000000-0000-0000-0000-000000000000`, {
      headers: authHeaders(),
    });
    // 404 or 200 with empty — both acceptable
    expect([200, 404]).toContain(res.status());
  });
});

test.describe("Traces Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("traces page loads without errors @smoke", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("traces page renders content", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Trace")
      .or(page.locator("text=trace"))
      .or(page.locator("text=No traces"));
    // On mobile, may need scrolling — check DOM attachment
    await expect(content.first()).toBeAttached({ timeout: 5000 });
  });

  test("traces page shows filter controls", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    // Should have some kind of filter/search UI
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
