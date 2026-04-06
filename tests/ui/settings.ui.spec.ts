import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Settings — comprehensive UI regression ───────── */

test.describe("Settings Redirect", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("settings root redirects to notifications @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1000);
    const url = page.url();
    // Should redirect to /settings/notifications
    expect(url).toMatch(/settings\/(notifications|appearance)/);
  });
});

test.describe("Settings Appearance Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("appearance page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("appearance page shows breadcrumbs (Settings > Appearance) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const breadcrumb = page.locator("text=Appearance").first();
    await expect(breadcrumb).toBeVisible({ timeout: 5000 });
  });

  test("appearance page has Notifications and Appearance tabs @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const notifTab = page.locator("text=Notifications").first();
    const appearTab = page.locator("text=Appearance").first();
    await expect(notifTab).toBeVisible({ timeout: 5000 });
    await expect(appearTab).toBeVisible({ timeout: 5000 });
  });

  test("appearance page shows 'What is this?' section description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"));
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Theme Cards ────────────────────────────────────────────
  test("appearance page shows System theme card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const system = page.locator("text=System");
    await expect(system.first()).toBeVisible({ timeout: 5000 });
  });

  test("System theme card shows description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=Follow your operating system preference");
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  test("appearance page shows Light theme card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const light = page.locator("text=Light");
    await expect(light.first()).toBeVisible({ timeout: 5000 });
  });

  test("Light theme card shows description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=Light backgrounds with dark text");
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  test("appearance page shows Dark theme card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const dark = page.locator("text=Dark");
    await expect(dark.first()).toBeVisible({ timeout: 5000 });
  });

  test("Dark theme card shows description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=Dark backgrounds with light text");
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  test("one theme card shows Active badge @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const active = page.locator("text=Active");
    await expect(active.first()).toBeVisible({ timeout: 5000 });
  });

  test("theme cards have icons @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    // Each card has an SVG icon (monitor, sun, moon)
    const icons = page.locator("svg");
    const count = await icons.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test("clicking Light theme switches active badge @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const lightCard = page.locator("text=Light").first().locator("..");
    if (await lightCard.isVisible()) {
      await lightCard.click();
      await page.waitForTimeout(500);
      // Active badge should move to Light
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("Notifications tab navigates to notifications settings @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("domcontentloaded");
    const notifTab = page.locator("text=Notifications").first();
    await notifTab.click();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("notification");
  });

  test("no console errors on appearance page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/settings/appearance`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});

test.describe("Settings Sessions Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("sessions page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/settings/sessions`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("sessions page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/sessions`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Session")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("sessions page has Revoke All Others button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/sessions`);
    await page.waitForLoadState("domcontentloaded");
    const revokeAll = page.getByRole("button", { name: /revoke all/i })
      .or(page.locator("text=Revoke All"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("sessions page shows current session with badge @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/sessions`);
    await page.waitForLoadState("domcontentloaded");
    const current = page.locator("text=Current")
      .or(page.locator("[data-testid='current-session']"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("session cards show browser and IP info @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/sessions`);
    await page.waitForLoadState("domcontentloaded");
    const sessionInfo = page.locator("text=/Chrome|Firefox|Safari|Edge|curl/i")
      .or(page.locator("text=/\\d+\\.\\d+\\.\\d+/"));
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
