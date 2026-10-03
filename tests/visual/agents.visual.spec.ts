import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Visual Regression — Agents Page
   Baselines: full page, agent cards, status indicators
   ══════════════════════════════════════════════════════════════ */

test.describe("Agents Visual Regression @visual @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("agents page full layout matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    // not "networkidle": the page holds an EventSource (/api/dashboard/stream) open, so the network
    // never idles; wait for the rendered page header instead
    await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("agents-full.png", {
      maxDiffPixelRatio: 0.02,
      fullPage: true,
    });
  });

  test("agents above-the-fold matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    // not "networkidle": the page holds an EventSource (/api/dashboard/stream) open, so the network
    // never idles; wait for the rendered page header instead
    await expect(page.getByRole("heading", { level: 1, name: "Agents" })).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);
    await expect(page).toHaveScreenshot("agents-above-fold.png", {
      maxDiffPixelRatio: 0.02,
    });
  });

  test("agent card component matches baseline", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);
    const card = page.locator("[data-testid='agent-card']")
      .or(page.locator("[class*='card']").filter({ hasText: /agent|status/i }))
      .first();
    if (await card.isVisible()) {
      await expect(card).toHaveScreenshot("agents-card.png", {
        maxDiffPixelRatio: 0.03,
      });
    }
  });
});
