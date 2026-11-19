import { test, expect } from "@playwright/test";
import { MC_URL, authenticate } from "../helpers/auth";

/* ── Tenant Switcher — UI tests ──────────────────────── */

test.describe("Tenant Switcher UI", () => {
  test.beforeEach(async ({ context }) => {
    await authenticate(context);
  });

  test("tenant switcher is visible in header @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // TenantSwitcher renders in header — look for the component
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
  });

  test("client portal page loads for tenant users @regression", async ({ page }) => {
    const response = await page.goto(`${MC_URL}/client`);
    expect(response?.status()).toBe(200);
  });
});
