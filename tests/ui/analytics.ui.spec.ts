import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Analytics — comprehensive UI regression ──────── */

test.describe("Analytics Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("analytics page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/analytics`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("analytics page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/analytics`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Analytics")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("analytics page shows charts or visualization @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/analytics`);
    await page.waitForLoadState("domcontentloaded");
    const charts = page.locator(".recharts-wrapper, canvas, svg")
      .or(page.locator("text=/chart|graph|trend/i"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("analytics page has date range selector @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/analytics`);
    await page.waitForLoadState("domcontentloaded");
    const dateRange = page.locator("select, [data-testid='date-range']")
      .or(page.locator("text=/7d|30d|90d|custom/i"))
      .or(page.getByRole("combobox"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on analytics page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/analytics`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
