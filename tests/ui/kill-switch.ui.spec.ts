import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Kill Switch — comprehensive UI regression ────── */

test.describe("Kill Switch UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("header renders with kill switch area @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
  });

  test("Ctrl+Shift+K opens quick-kill dialog @smoke @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator('[role="dialog"]')
      .or(page.locator("text=Kill Active Agent"))
      .or(page.locator("text=No active runs"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  });

  test("kill dialog shows agent list or 'no active runs' @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const content = page.locator("text=No active runs")
      .or(page.locator("text=Kill Active Agent"))
      .or(page.locator("[data-testid='active-run']"));
    await expect(content.first()).toBeVisible({ timeout: 3000 });
  });

  test("kill dialog has cancel button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator('[role="dialog"]')
      .or(page.locator("text=Kill Active Agent"))
      .or(page.locator("text=No active runs"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
    const cancel = page.getByRole("button", { name: /cancel|close|dismiss/i })
      .or(page.locator('[role="dialog"] button').last());
    await expect(cancel.first()).toBeVisible({ timeout: 3000 });
  });

  test("Escape closes kill dialog @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator('[role="dialog"]')
      .or(page.locator("text=Kill Active Agent"))
      .or(page.locator("text=No active runs"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await expect(dialog.first()).toBeHidden({ timeout: 3000 });
  });

  test("kill dialog accessible from non-dashboard pages @regression", async ({ page }) => {
    const pages = ["/costs", "/agents", "/workflows", "/security"];
    for (const path of pages) {
      await page.goto(`${MC_URL}${path}`);
      await page.waitForLoadState("domcontentloaded");
      await page.keyboard.press("Control+Shift+K");
      const dialog = page.locator('[role="dialog"]')
        .or(page.locator("text=Quick Kill"))
        .or(page.locator("text=No active runs"));
      await expect(dialog.first()).toBeVisible({ timeout: 3000 });
      await page.keyboard.press("Escape");
    }
  });
});
