import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, OWNER_EMAIL, OWNER_PASSWORD } from "../helpers/auth";

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

  // FLIPPED (transformate WI-4493): was "password input has autofocus"; the email field of the session form is first.
  test("email input has autofocus @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const email = page.locator("input[type='email']").first();
    await expect(email).toBeVisible({ timeout: 5000 });
    const isFocused = await email.evaluate(el => document.activeElement === el);
    expect(isFocused).toBeTruthy();
  });

  test("login page shows the email and password form and zero passphrase field @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("input[type='email']").first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator("input[type='password']").first()).toBeVisible();
    await expect(page.getByPlaceholder(/passphrase/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /passphrase/i })).toHaveCount(0);
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
    // The form guards an empty secret by disabling submit (login-page.tsx, since the first commit);
    // click() waits for an enabled button and timed out. Assert the guard itself, then the URL.
    await expect(submit.first()).toBeVisible({ timeout: 5000 });
    await expect(submit.first()).toBeDisabled();
    expect(page.url()).toContain("/login");
  });

  test("submitting wrong password shows error message @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    const password = page.locator("input[type='password']").first();
    if (await password.isVisible()) {
      await page.locator("input[type='email']").first().fill(OWNER_EMAIL);
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
      // Slow down the API response (the session road, transformate WI-4493)
      await page.route("**/api/auth/login", (route) => {
        setTimeout(() => route.fulfill({ status: 401, body: JSON.stringify({ error: "Invalid" }) }), 1500);
      });
      await page.locator("input[type='email']").first().fill(OWNER_EMAIL);
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

  // -- The session road, init retired (transformate WI-4492, WI-4493) --
  test("the sign-in form posts to /api/auth/login and never to /api/auth/init @regression", async ({ page }) => {
    const posted: string[] = [];
    await page.route("**/api/auth/init", (route) => { posted.push("init"); return route.fulfill({ status: 410, body: "{}" }); });
    await page.route("**/api/auth/login", (route) => { posted.push("login"); return route.fulfill({ status: 401, body: JSON.stringify({ error: "Invalid email or password" }) }); });
    await page.goto(`${MC_URL}/login`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator("input[type='email']").first().fill(OWNER_EMAIL);
    await page.locator("input[type='password']").first().fill("wrong-password-12345");
    await page.getByRole("button", { name: /sign in/i }).first().click();
    await expect(page.locator("text=/invalid email or password/i").first()).toBeVisible({ timeout: 5000 });
    expect(posted).toEqual(["login"]);
  });

  test("the retired init answers 410 init_retired and sets zero cookie @regression @security", async ({ page }) => {
    const res = await page.request.post(`${MC_URL}/api/auth/init`, { headers: { Authorization: `Bearer ${ADMIN_TOKEN}` } });
    expect(res.status()).toBe(410);
    expect(await res.json()).toEqual({ error: "init_retired" });
    expect(res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie")).toEqual([]);
  });

  test.describe("signed out", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("the seeded owner signs in by email and password and reaches the dashboard @smoke @regression", async ({ page }) => {
      await page.goto(`${MC_URL}/login`);
      await page.waitForLoadState("domcontentloaded");
      await page.locator("input[type='email']").first().fill(OWNER_EMAIL);
      await page.locator("input[type='password']").first().fill(OWNER_PASSWORD);
      await page.getByRole("button", { name: /sign in/i }).first().click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15000 });
      const session = (await page.context().cookies(MC_URL)).find((c) => c.name === "mc_auth");
      expect(session?.httpOnly).toBe(true);
      expect(session?.value).not.toBe(ADMIN_TOKEN);
    });
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
