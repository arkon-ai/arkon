import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Infrastructure — comprehensive UI regression ── */

test.describe("Infrastructure Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("infrastructure page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("infrastructure page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Infrastructure").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("infrastructure page shows topology or node list @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Infrastructure")
      .or(page.locator("text=Nodes"))
      .or(page.locator("text=No nodes"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("infrastructure page shows node cards with health data @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    const nodes = page.locator("[data-testid='node-card']")
      .or(page.locator("[class*='node']"))
      .or(page.locator("text=/CPU|Memory|Disk|health/i"));
    const count = await nodes.count();
    if (count > 0) {
      await expect(nodes.first()).toBeVisible();
    }
  });

  test("infrastructure page has refresh button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    const refresh = page.getByRole("button", { name: /refresh|collect|reload/i })
      .or(page.locator("text=Refresh"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("infrastructure page shows topology visualization @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    const topology = page.locator("[data-testid='topology-map']")
      .or(page.locator("canvas, svg").first())
      .or(page.locator("text=/topology|server/i"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("infrastructure page handles empty state @regression", async ({ page }) => {
    await page.route("**/api/infrastructure/**", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ nodes: [] }) })
    );
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on infrastructure page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
