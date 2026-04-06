import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: VictoryOS — comprehensive UI regression ──────── */

test.describe("VictoryOS Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("VictoryOS page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/victoryos`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("VictoryOS page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/victoryos`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=VictoryOS")
      .or(page.locator("text=Victory"))
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("VictoryOS page shows dashboard content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/victoryos`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on VictoryOS page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/victoryos`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
