import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Visual Regression — Security Page
   Baselines: full page, threat cards, severity indicators
   ══════════════════════════════════════════════════════════════ */

test.describe("Security Visual Regression @visual @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("security page full layout matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("security-full.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("security above-the-fold matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("security-above-fold.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("ThreatGuard severity cards match baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const cards = page.locator("[data-testid='severity-cards']")
      .or(page.locator("[class*='card']").filter({ hasText: /critical|high|medium|low/i }).first());
    if (await cards.first().isVisible()) {
      await expect(cards.first()).toHaveScreenshot("security-severity-cards.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
