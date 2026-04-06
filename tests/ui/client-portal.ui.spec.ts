import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Client Portal — UI + API tests ──────────────────────────── */

test.describe("Client Portal Pages", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("client dashboard loads @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const res = await page.goto(`${MC_URL}/client`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("client agents page loads @regression", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/client/agents`);
    expect(res?.status()).toBe(200);
  });

  test("client costs page loads @regression", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/client/costs`);
    expect(res?.status()).toBe(200);
  });

  test("client API keys page loads @regression", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/client/api-keys`);
    expect(res?.status()).toBe(200);
  });

  test("client portal shows 'Powered by Arkon' @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/client`);
    await page.waitForLoadState("domcontentloaded");
    // On mobile viewports the footer may be below the fold — check DOM presence instead
    const powered = page.locator("text=Powered by Arkon")
      .or(page.locator("text=Arkon"));
    await expect(powered.first()).toBeAttached({ timeout: 5000 });
  });
});

test.describe("Client Portal Navigation", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("client portal has navigation tabs @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/client`);
    await page.waitForLoadState("domcontentloaded");
    // Should have tab navigation — Dashboard, Agents, Costs, API Keys
    const tabs = page.locator("text=Dashboard")
      .or(page.locator("text=Agents"))
      .or(page.locator("text=Costs"))
      .or(page.locator("text=API Keys"));
    // On mobile, tabs may be in a scrollable row — check DOM presence
    await expect(tabs.first()).toBeAttached({ timeout: 5000 });
  });
});
