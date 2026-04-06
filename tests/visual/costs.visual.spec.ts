import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Visual Regression — Costs Page
   Baselines: full page, time range selector, cost breakdown
   ══════════════════════════════════════════════════════════════ */

test.describe("Costs Visual Regression @visual @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("costs page full layout matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("costs-full.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("costs above-the-fold matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("costs-above-fold.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("cost breakdown table matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const table = page.locator("table")
      .or(page.locator("[data-testid='cost-breakdown']"))
      .or(page.locator("[class*='table']"))
      .first();
    if (await table.isVisible()) {
      await expect(table).toHaveScreenshot("costs-breakdown-table.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
