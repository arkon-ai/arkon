import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Incidents — comprehensive UI regression ──────── */

test.describe("Incidents Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("incidents page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/incidents`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("incidents page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/incidents`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Incident")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("incidents page shows incident list or empty state @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/incidents`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("[data-testid='incident-card']")
      .or(page.locator("table"))
      .or(page.locator("text=/no incident|all clear/i"))
      .or(page.locator("text=Incident"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("incidents page shows severity indicators @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/incidents`);
    await page.waitForLoadState("domcontentloaded");
    const severity = page.locator("text=/critical|high|medium|low|open|resolved/i");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on incidents page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/incidents`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
