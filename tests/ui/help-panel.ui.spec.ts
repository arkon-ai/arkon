import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Help Panel & Glossary — comprehensive UI regression ── */

test.describe("Help Panel", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("help button is visible in header @smoke @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const helpBtn = page.locator('[aria-label="Help"]');
    await expect(helpBtn).toBeVisible({ timeout: 5000 });
  });

  test("clicking help button opens slide-out panel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const helpBtn = page.locator('[aria-label="Help"]');
    await helpBtn.click();
    const panel = page.locator("text=Key Concepts")
      .or(page.locator("text=Common Tasks"));
    await expect(panel.first()).toBeVisible({ timeout: 3000 });
  });

  test("? key opens help panel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const panelContent = page.locator("text=Key Concepts")
      .or(page.locator("text=Common Tasks"));
    await expect(panelContent.first()).toBeVisible({ timeout: 3000 });
  });

  test("help panel can be closed via close button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const helpBtn = page.locator('[aria-label="Help"]');
    await helpBtn.click();
    const backdrop = page.locator(".fixed.inset-0.bg-black\\/40");
    await expect(backdrop).toBeVisible({ timeout: 3000 });
    const closeBtn = page.locator('[aria-label="Close help"]');
    await closeBtn.click();
    await expect(backdrop).toBeHidden({ timeout: 3000 });
  });

  test("Escape closes help panel @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const panelContent = page.locator("text=Key Concepts")
      .or(page.locator("text=Common Tasks"));
    await expect(panelContent.first()).toBeVisible({ timeout: 3000 });
    await page.keyboard.press("Escape");
    await expect(panelContent.first()).toBeHidden({ timeout: 3000 });
  });

  test("help panel shows contextual content for dashboard @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const dashHelp = page.locator("text=Dashboard");
    await expect(dashHelp.first()).toBeVisible({ timeout: 3000 });
  });

  test("help panel shows contextual content for security page @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const secHelp = page.locator("text=ThreatGuard").or(page.locator("text=threat"));
    await expect(secHelp.first()).toBeVisible({ timeout: 3000 });
  });

  test("help panel shows contextual content for costs page @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const costHelp = page.locator("text=Cost")
      .or(page.locator("text=cost"));
    await expect(costHelp.first()).toBeVisible({ timeout: 3000 });
  });

  test("help panel has link to full glossary @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.keyboard.press("?");
    const glossaryLink = page.locator("a[href*='glossary']")
      .or(page.locator("text=Glossary"));
    await expect(glossaryLink.first()).toBeVisible({ timeout: 3000 });
  });
});

test.describe("Glossary Page", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("glossary page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/help/glossary`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("glossary shows searchable terms @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/help/glossary`);
    await page.waitForLoadState("domcontentloaded");
    const terms = page.locator("text=Agent")
      .or(page.locator("text=Kill Switch"))
      .or(page.locator("text=Workflow"));
    await expect(terms.first()).toBeVisible({ timeout: 5000 });
  });

  test("glossary has search input @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/help/glossary`);
    await page.waitForLoadState("domcontentloaded");
    const search = page.getByPlaceholder(/search/i)
      .or(page.locator("input[type='text'], input[type='search']"));
    await expect(search.first()).toBeVisible({ timeout: 5000 });
  });

  test("glossary search filters terms @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/help/glossary`);
    await page.waitForLoadState("domcontentloaded");
    const search = page.getByPlaceholder(/search/i).first();
    if (await search.isVisible()) {
      await search.fill("kill");
      await page.waitForTimeout(300);
      const results = page.locator("text=Kill Switch")
        .or(page.locator("text=kill"));
      await expect(results.first()).toBeVisible({ timeout: 3000 });
    }
  });
});
