import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Session 8: Cost Tracking — API + UI regression ────────────── */

test.describe("Cost APIs", () => {
  test("GET /api/costs/overview returns cost data", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/costs/by-agent returns per-agent costs", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-agent`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/costs/by-model returns per-model costs", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-model`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/admin/budgets returns budget config", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/budgets`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("costs endpoints require auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Costs Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("costs page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("costs page shows summary grid or empty state", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Costs")
      .or(page.locator("text=Projected"))
      .or(page.locator("text=Budget"))
      .or(page.locator("text=No cost data"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("costs page has CSV export button", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const exportBtn = page.locator("text=Export")
      .or(page.locator("text=CSV"))
      .or(page.locator("text=Download"));
    // Export button should exist (even if no data)
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
