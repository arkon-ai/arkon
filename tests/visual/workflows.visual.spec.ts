import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Visual Regression — Workflows Page
   Baselines: full page, template gallery, workflow list
   ══════════════════════════════════════════════════════════════ */

test.describe("Workflows Visual Regression @visual @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("workflows page full layout matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("workflows-full.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("workflows above-the-fold matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("workflows-above-fold.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("workflow template gallery matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const gallery = page.locator("[data-testid='template-gallery']")
      .or(page.locator("[class*='template']"))
      .or(page.locator("[class*='gallery']"))
      .first();
    if (await gallery.isVisible()) {
      await expect(gallery).toHaveScreenshot("workflows-template-gallery.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
