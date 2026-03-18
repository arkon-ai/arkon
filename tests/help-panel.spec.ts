import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "./helpers/auth";

/* ── Session 10: Help Panel & Glossary — UI regression ─────────── */

test.describe("Help Panel", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("help button is visible in header", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    const helpBtn = page.locator('[aria-label="Help"]');
    await expect(helpBtn).toBeVisible({ timeout: 5000 });
  });

  test("clicking help button opens slide-out panel", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    const helpBtn = page.locator('[aria-label="Help"]');
    await helpBtn.click();
    // Panel should slide in with help content
    const panel = page.locator("text=Key Concepts")
      .or(page.locator("text=Common Tasks"))
      .or(page.locator("text=Search Glossary"));
    await expect(panel.first()).toBeVisible({ timeout: 3000 });
  });

  test("? key toggles help panel", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    // Press ? to open
    await page.keyboard.press("?");
    const panel = page.locator("text=Search Glossary");
    await expect(panel).toBeVisible({ timeout: 3000 });
    // Press ? again to close
    await page.keyboard.press("?");
    await expect(panel).toBeHidden({ timeout: 3000 });
  });

  test("Escape closes help panel", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("?");
    const panel = page.locator("text=Search Glossary");
    await expect(panel).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden({ timeout: 3000 });
  });

  test("help panel shows contextual content per page", async ({ page }) => {
    // Check dashboard
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("?");
    const dashHelp = page.locator("text=Dashboard");
    await expect(dashHelp.first()).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");

    // Navigate to security and check different content
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("?");
    const secHelp = page.locator("text=ThreatGuard").or(page.locator("text=threat"));
    await expect(secHelp.first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Glossary Page", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("glossary page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/help/glossary`);
    await page.waitForLoadState("networkidle");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("glossary shows searchable terms", async ({ page }) => {
    await page.goto(`${MC_URL}/help/glossary`);
    await page.waitForLoadState("networkidle");
    // Should have glossary terms visible
    const terms = page.locator("text=Agent")
      .or(page.locator("text=Kill Switch"))
      .or(page.locator("text=Workflow"));
    await expect(terms.first()).toBeVisible({ timeout: 5000 });
  });
});
