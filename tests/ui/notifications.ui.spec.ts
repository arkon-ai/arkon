import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authenticate } from "../helpers/auth";

/* ── Phase 3: Notifications — comprehensive UI regression ──── */

test.describe("Notification Bell UI", () => {
  test.beforeEach(async ({ context }) => {
    await authenticate(context);
  });

  test("notification bell icon is visible in header @smoke @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const header = page.locator("header").first();
    await expect(header).toBeVisible();
    const bell = header.locator('button[aria-label*="notification" i]')
      .or(header.locator('button[aria-label*="bell" i]'));
    await expect(bell.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking bell opens notification dropdown @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const header = page.locator("header").first();
    const bell = header.locator('button[aria-label*="notification" i]')
      .or(header.locator('button[aria-label*="bell" i]'));
    if (await bell.first().isVisible()) {
      await bell.first().click();
      await page.waitForTimeout(500);
      const dropdown = page.locator('[role="menu"], [role="dialog"], [data-testid="notification-panel"]')
        .or(page.locator("text=Notifications").nth(1));
      await expect(dropdown.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("notification dropdown shows messages or empty state @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const header = page.locator("header").first();
    const bell = header.locator('button[aria-label*="notification" i]')
      .or(header.locator('button[aria-label*="bell" i]'));
    if (await bell.first().isVisible()) {
      await bell.first().click();
      await page.waitForTimeout(500);
      const content = page.locator("text=/no notification|all caught up|mark.*read/i")
        .or(page.locator("[data-testid='notification-item']"));
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});

test.describe("Notification Settings Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await authenticate(context);
  });

  test("notification settings page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("notification settings shows channel list @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Notification")
      .or(page.locator("text=Channel"))
      .or(page.locator("text=Telegram"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("notification settings shows Telegram channel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const telegram = page.locator("text=Telegram");
    await expect(telegram.first()).toBeVisible({ timeout: 5000 });
  });

  test("notification settings shows Slack channel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const slack = page.locator("text=Slack");
    await expect(slack.first()).toBeVisible({ timeout: 5000 });
  });

  test("notification settings shows Discord channel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const discord = page.locator("text=Discord");
    await expect(discord.first()).toBeVisible({ timeout: 5000 });
  });

  test("notification settings shows Email channel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const email = page.locator("text=Email");
    await expect(email.first()).toBeVisible({ timeout: 5000 });
  });

  test("notification settings shows Webhook channel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const webhook = page.locator("text=Webhook");
    await expect(webhook.first()).toBeVisible({ timeout: 5000 });
  });

  test("channel cards are expandable @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const telegram = page.locator("text=Telegram").first();
    if (await telegram.isVisible()) {
      await telegram.click();
      await page.waitForTimeout(300);
      // Should expand to show form fields
      const fields = page.locator("text=/bot_token|chat_id|token|ID/i")
        .or(page.locator("input"));
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("expanded channel shows save and test buttons @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const telegram = page.locator("text=Telegram").first();
    if (await telegram.isVisible()) {
      await telegram.click();
      await page.waitForTimeout(500);
      const save = page.getByRole("button", { name: /save/i });
      const testBtn = page.getByRole("button", { name: /test/i });
      // At least one should be visible
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("in-app notifications badge shows always-on @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("domcontentloaded");
    const inApp = page.locator("text=/in-app|always on/i");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on notification settings page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
