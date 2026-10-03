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
    // Trigger the error with an invalid secret: submit is disabled while the field is empty,
    // so an empty submit never produced an error state (click() waited on a disabled button).
    await page.locator("input[type='password']").first().fill("wrong-password-12345");
    await page.getByRole("button", { name: /sign in|log in|submit/i }).first().click();
    await expect(page.locator("[role='alert']").or(page.locator("text=/invalid|incorrect|failed|error/i")).first())
      .toBeVisible({ timeout: 5000 });
    await expect(page).toHaveScreenshot("login-error-state.png", {
      maxDiffPixelRatio: 0.03,
    });
  });
});
