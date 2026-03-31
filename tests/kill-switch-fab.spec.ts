import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Floating Kill Switch FAB — API + UI tests ──────────────── */

test.describe("Kill Switch API", () => {
  test("GET /api/active-runs returns runs array @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/active-runs`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.runs)).toBeTruthy();
  });

  test("GET /api/active-runs requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/active-runs`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/tools/agents-live returns data", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/agents-live`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });
});

test.describe("Floating Kill Switch UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("FAB is hidden when no agents are running", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // Wait for the active-runs poll to complete (3s interval)
    await page.waitForTimeout(4000);
    // FAB should not be visible when no runs
    const fab = page.locator('button[aria-label*="active agent"]');
    await expect(fab).toHaveCount(0);
  });

  test("Ctrl+Shift+K opens quick-kill dialog on any page", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    // Quick kill dialog should appear
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs to kill"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  });

  test("Ctrl+Shift+K works from non-dashboard page", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs to kill"));
    await expect(dialog.first()).toBeVisible({ timeout: 3000 });
  });

  test("Escape closes quick-kill dialog", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // Wait for JS to hydrate before keyboard shortcuts work
    await page.waitForTimeout(1000);
    await page.keyboard.press("Control+Shift+K");
    const dialog = page.locator("text=Quick Kill")
      .or(page.locator("text=No active runs to kill"));
    await expect(dialog.first()).toBeVisible({ timeout: 5000 });
    await page.keyboard.press("Escape");
    await expect(dialog.first()).toBeHidden({ timeout: 3000 });
  });

  test("no ActiveRunBanner in DOM (replaced by FAB)", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // The old banner had a gradient from-red-950 — should no longer exist in main content
    const oldBanner = page.locator(".from-red-950\\/40");
    await expect(oldBanner).toHaveCount(0);
  });
});
