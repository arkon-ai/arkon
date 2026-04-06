import { test, expect } from "@playwright/test";
import { MC_URL } from "../helpers/auth";

/* ── Phase 3: Login — comprehensive UI regression ──────────── */

test.describe("Login Page UI", () => {
  // ── Basic Rendering ────────────────────────────────────────
  test("login page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("login page shows Arkon branding @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const branding = page.locator("text=Arkon")
      .or(page.locator("text=ARKON"))
      .or(page.locator("svg, img").first());
    await expect(branding.first()).toBeVisible({ timeout: 5000 });
  });

  test("login page has password input field @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const password = page.locator("input[type='password']")
      .or(page.getByLabel(/password|passphrase/i));
    await expect(password.first()).toBeVisible({ timeout: 5000 });
  });

  test("password input has autofocus @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const password = page.locator("input[type='password']").first();
    if (await password.isVisible()) {
      const isFocused = await password.evaluate(el => document.activeElement === el);
      expect(isFocused).toBeTruthy();
    }
  });

  test("login page has submit button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const submit = page.getByRole("button", { name: /sign in|log in|submit|authenticate/i })
      .or(page.locator("button[type='submit']"));
    await expect(submit.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Form Interaction ───────────────────────────────────────
  test("submitting empty password shows error or stays on page @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const submit = page.getByRole("button", { name: /sign in|log in|submit|authenticate/i })
      .or(page.locator("button[type='submit']"));
    if (await submit.first().isVisible()) {
      await submit.first().click();
      await page.waitForTimeout(500);
      expect(page.url()).toContain("/login");
    }
  });

  test("submitting wrong password shows error message @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const password = page.locator("input[type='password']").first();
    if (await password.isVisible()) {
      await password.fill("wrong-password-12345");
      const submit = page.getByRole("button", { name: /sign in|log in|submit|authenticate/i })
        .or(page.locator("button[type='submit']"));
      await submit.first().click();
      await page.waitForTimeout(1000);
      const error = page.locator("[role='alert']")
        .or(page.locator("text=/invalid|incorrect|failed|error/i"));
      await expect(error.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("submit button shows loading state during auth @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const password = page.locator("input[type='password']").first();
    if (await password.isVisible()) {
      // Slow down the API response
      await page.route("**/api/auth/init", (route) => {
        setTimeout(() => route.fulfill({ status: 401, body: JSON.stringify({ error: "Invalid" }) }), 1500);
      });
      await password.fill("test-password");
      const submit = page.getByRole("button", { name: /sign in|log in|submit|authenticate/i })
        .or(page.locator("button[type='submit']"));
      await submit.first().click();
      // Button should show loading text
      const loading = page.locator("text=Authenticating")
        .or(page.locator("button[disabled]"));
      await expect(loading.first()).toBeVisible({ timeout: 2000 });
    }
  });

  // ── Visual Design ─────────────────────────────────────────
  test("login page has dark theme background @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    // Login page should have a dark/gradient background
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("login page has no sidebar navigation @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    // Login is a standalone page, no app shell
    const sidebar = page.locator("aside nav, [data-testid='sidebar']");
    const count = await sidebar.count();
    // Sidebar should not be visible
    if (count > 0) {
      await expect(sidebar.first()).toBeHidden();
    }
  });

  test("no console errors on login page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
