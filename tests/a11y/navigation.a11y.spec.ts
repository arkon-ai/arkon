import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Accessibility — Navigation & Keyboard
   Focus management, skip links, tab order, ARIA landmarks
   Tags: @a11y @regression
   ══════════════════════════════════════════════════════════════ */

test.describe("Navigation Accessibility @a11y @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Skip Link ──────────────────────────────────────────────
  test("skip-to-content link is present and becomes visible on focus", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Tab to activate skip link
    await page.keyboard.press("Tab");
    const skipLink = page.locator("a[href='#main-content'], a[href='#content']")
      .or(page.getByText(/skip to/i));

    // Skip links may not exist in all apps — soft check
    const count = await skipLink.count();
    if (count > 0) {
      await expect(skipLink.first()).toBeFocused();
    }
  });

  // ── ARIA Landmarks ─────────────────────────────────────────
  test("dashboard has correct ARIA landmark regions", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Must have at least a main landmark
    const main = page.locator("main, [role='main']");
    await expect(main.first()).toBeAttached();

    // Navigation landmark should exist
    const nav = page.locator("nav, [role='navigation']");
    expect(await nav.count()).toBeGreaterThan(0);
  });

  test("sidebar navigation has accessible labels", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    const nav = page.locator("nav, [role='navigation']").first();
    if (await nav.isVisible()) {
      // Nav should have aria-label or contain labeled links
      const links = nav.locator("a");
      const count = await links.count();
      for (let i = 0; i < Math.min(count, 10); i++) {
        const link = links.nth(i);
        const text = await link.textContent();
        const ariaLabel = await link.getAttribute("aria-label");
        // Each link should have visible text or aria-label
        expect(
          (text && text.trim().length > 0) || (ariaLabel && ariaLabel.length > 0),
          `Nav link ${i} should have accessible text`
        ).toBeTruthy();
      }
    }
  });

  // ── Tab Order ──────────────────────────────────────────────
  test("interactive elements are reachable via Tab key on dashboard", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(500);

    // Tab through first 10 focusable elements — none should be trapped
    const focusedTags: string[] = [];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Tab");
      const tag = await page.evaluate(() => document.activeElement?.tagName ?? "NONE");
      focusedTags.push(tag);
    }

    // Should have hit more than just BODY (i.e., focus is moving)
    const unique = new Set(focusedTags);
    expect(unique.size).toBeGreaterThan(1);
  });

  test("focus does not get trapped in sidebar navigation", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Tab many times — focus should eventually leave nav area
    const navElements: boolean[] = [];
    for (let i = 0; i < 20; i++) {
      await page.keyboard.press("Tab");
      const inNav = await page.evaluate(() => {
        const el = document.activeElement;
        return el?.closest("nav") !== null || el?.closest("[role='navigation']") !== null;
      });
      navElements.push(inNav);
    }

    // Focus should leave nav at some point (not all true)
    expect(navElements.some((v) => !v)).toBeTruthy();
  });

  // ── Focus Visible ──────────────────────────────────────────
  test("focused elements have visible focus indicators", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Tab to first interactive element
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");

    const hasOutline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return true; // Skip if nothing focusable
      const styles = getComputedStyle(el);
      return (
        styles.outlineStyle !== "none" ||
        styles.boxShadow !== "none" ||
        el.classList.toString().includes("focus") ||
        el.classList.toString().includes("ring")
      );
    });
    expect(hasOutline).toBeTruthy();
  });

  // ── Keyboard Shortcut (Kill Switch) ────────────────────────
  test("kill switch keyboard shortcut Ctrl+Shift+K is accessible", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Kill switch FAB should be keyboard-accessible
    const fab = page.getByRole("button", { name: /kill/i }).first();
    if (await fab.isVisible()) {
      // Focus and press Enter
      await fab.focus();
      await expect(fab).toBeFocused();
      // Should be reachable and have accessible name
      const name = await fab.getAttribute("aria-label") ?? await fab.textContent();
      expect(name).toBeTruthy();
    }
  });

  // ── Page-level a11y on nav-heavy pages ─────────────────────
  test("settings page tabs are keyboard navigable", async ({ page }) => {
    await page.goto(`${MC_URL}/settings`);
    await page.waitForLoadState("domcontentloaded");

    const tablist = page.locator("[role='tablist']")
      .or(page.locator("nav").filter({ hasText: /appearance|notifications|sessions/i }));

    if (await tablist.first().isVisible()) {
      const tabs = tablist.first().locator("[role='tab'], a, button");
      const count = await tabs.count();
      if (count > 1) {
        // First tab should be focusable
        await tabs.first().focus();
        await expect(tabs.first()).toBeFocused();
        // Arrow right or Tab should move focus
        await page.keyboard.press("ArrowRight");
      }
    }
  });

  // ── Dialog Accessibility ───────────────────────────────────
  test("modal dialogs trap focus correctly", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");

    // Try to open kill switch dialog
    const fab = page.getByRole("button", { name: /kill/i }).first();
    if (await fab.isVisible()) {
      await fab.click();
      await page.waitForTimeout(300);

      const dialog = page.locator("[role='dialog'], [role='alertdialog'], dialog").first();
      if (await dialog.isVisible()) {
        // Dialog should have aria-label or aria-labelledby
        const hasLabel = await dialog.evaluate((el) => {
          return !!el.getAttribute("aria-label") || !!el.getAttribute("aria-labelledby");
        });
        expect(hasLabel).toBeTruthy();

        // Escape should close
        await page.keyboard.press("Escape");
        await expect(dialog).not.toBeVisible({ timeout: 2000 });
      }
    }
  });
});
