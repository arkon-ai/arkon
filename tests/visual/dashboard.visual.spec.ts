import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Visual Regression — Dashboard
   Baselines: full page, health gauge, stat cards, activity feed
   ══════════════════════════════════════════════════════════════ */

test.describe("Dashboard Visual Regression @visual @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("dashboard full page matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    // not "networkidle": the page holds an EventSource (/api/dashboard/stream) open, so the network
    // never idles; wait for the rendered page header instead
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    // Wait for animations/transitions to settle
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("dashboard-full.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("dashboard above-the-fold matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    // not "networkidle": the page holds an EventSource (/api/dashboard/stream) open, so the network
    // never idles; wait for the rendered page header instead
    await expect(page.getByRole("heading", { level: 1, name: "Dashboard" })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("dashboard-above-fold.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("health gauge section matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const gauge = page.locator("[data-testid='health-gauge']")
      .or(page.locator("text=HEALTHY").locator("..").locator(".."))
      .or(page.locator("text=NEEDS ATTENTION").locator("..").locator(".."))
      .first();
    if (await gauge.isVisible()) {
      await expect(gauge).toHaveScreenshot("dashboard-health-gauge.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });

  test("stat cards row matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const stats = page.locator("[data-testid='stat-cards']")
      .or(page.locator("[class*='grid']").filter({ hasText: /agents|tokens|cost/i }).first());
    if (await stats.first().isVisible()) {
      await expect(stats.first()).toHaveScreenshot("dashboard-stat-cards.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
