import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "./helpers/auth";

test.describe("Mobile — Hamburger Menu", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("hamburger button is visible on mobile", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    const hamburger = page.locator('[aria-label="Open sidebar"]');
    await expect(hamburger).toBeVisible();
  });

  test("desktop sidebar is hidden on mobile", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    // The desktop aside uses 'hidden md:block' — should not be visible at 375px
    const desktopSidebar = page.locator("aside").first();
    await expect(desktopSidebar).toBeHidden();
  });

  test("hamburger opens mobile sidebar", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    const hamburger = page.locator('[aria-label="Open sidebar"]');
    await hamburger.click();
    // Mobile overlay should appear
    const overlay = page.locator('[aria-label="Close sidebar"]').or(
      page.locator('.fixed.inset-0')
    ).first();
    await expect(overlay).toBeVisible({ timeout: 3000 });
  });

  test("Escape key closes mobile sidebar", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.locator('[aria-label="Open sidebar"]').click();
    await page.waitForTimeout(300);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    // Hamburger should be visible again (sidebar closed)
    await expect(page.locator('[aria-label="Open sidebar"]')).toBeVisible();
  });

  test("nav links visible inside mobile sidebar", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.locator('[aria-label="Open sidebar"]').click();
    await page.waitForTimeout(400);
    // Should see at least one nav link
    const navLinks = page.locator("nav a, [role='navigation'] a");
    await expect(navLinks.first()).toBeVisible({ timeout: 3000 });
  });
});
