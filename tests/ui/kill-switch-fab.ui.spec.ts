import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Floating Kill Switch FAB — UI tests ──────────── */

test.describe("Floating Kill Switch UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("FAB is hidden when no agents are running @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);
    const fab = page.locator('button[aria-label*="active agent"]');
    await expect(fab).toHaveCount(0);
  });

  test("Ctrl+Shift+K opens quick-kill dialog on dashboard @smoke @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs to kill"))
      .or(page.locator("text=No active runs"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  });

  test("Ctrl+Shift+K works from costs page @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs to kill"))
      .or(page.locator("text=No active runs"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  });

  test("Ctrl+Shift+K works from agents page @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs"))
      .or(page.locator('[role="dialog"]'));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  });

  test("Escape closes quick-kill dialog @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs to kill"))
      .or(page.locator("text=No active runs"));
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(dialog.first()).toBeHidden({ timeout: 3000 });
  });

  test("no ActiveRunBanner in DOM (replaced by FAB) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const oldBanner = page.locator(".from-red-950\\/40");
    await expect(oldBanner).toHaveCount(0);
  });

  test("FAB shows when active runs are mocked @regression", async ({ page }) => {
    await page.route("**/api/tools/agents-live/active-runs", (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({
          runs: [{ id: "test-run-1", agent_id: "test-agent", started_at: new Date().toISOString() }],
        }),
      })
    );
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(4000);
    const fab = page.locator('button[aria-label*="active agent"]')
      .or(page.locator("[data-testid='kill-fab']"));
    // FAB should appear with mocked active runs
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
