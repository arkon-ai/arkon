import { test, expect } from "@playwright/test";
import { MC_URL } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Visual Regression — Login Page
   Baselines: full page, form layout (no auth needed)
   ══════════════════════════════════════════════════════════════ */

test.describe("Login Visual Regression @visual @regression", () => {
  test("login page full layout matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("login-full.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("login form matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const form = page.locator("form")
      .or(page.locator("[data-testid='login-form']"))
      .first();
    if (await form.isVisible()) {
      await expect(form).toHaveScreenshot("login-form.png", {
        maxDiffPixelRatio: 0.02,
      });
    }
  });

  test("login page with error state matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    // Trigger an error by submitting empty/invalid credentials
    const submitBtn = page.getByRole("button", { name: /sign in|log in|submit/i }).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      await page.waitForTimeout(500);
      await expect(page).toHaveScreenshot("login-error-state.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
