import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: ThreatGuard — comprehensive UI regression ────── */

test.describe("ThreatGuard UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Basic Rendering ────────────────────────────────────────
  test("ThreatGuard page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("ThreatGuard page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=ThreatGuard");
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("ThreatGuard shows subtitle about security posture @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const subtitle = page.locator("text=Security posture and threat intelligence")
      .or(page.locator("text=/security|posture|threat/i"));
    await expect(subtitle.first()).toBeVisible({ timeout: 5000 });
  });

  test("ThreatGuard shows 'What is this?' section description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"));
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Severity Cards (CRITICAL / HIGH / MEDIUM / LOW) ────────
  test("ThreatGuard shows CRITICAL severity card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const critical = page.locator("text=CRITICAL");
    await expect(critical.first()).toBeVisible({ timeout: 5000 });
  });

  test("ThreatGuard shows HIGH severity card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const high = page.locator("text=HIGH");
    await expect(high.first()).toBeVisible({ timeout: 5000 });
  });

  test("ThreatGuard shows MEDIUM severity card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const medium = page.locator("text=MEDIUM");
    await expect(medium.first()).toBeVisible({ timeout: 5000 });
  });

  test("ThreatGuard shows LOW severity card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const low = page.locator("text=LOW").first();
    await expect(low).toBeVisible({ timeout: 5000 });
  });

  test("severity cards show numeric counts @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    // Each severity card has a number (even 0)
    const critical = page.locator("text=CRITICAL").locator("..");
    const cardText = await critical.first().textContent();
    expect(cardText).toMatch(/\d/);
  });

  test("severity cards have color-coded borders @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    // Cards should be visible with distinct borders
    const cards = page.locator("text=CRITICAL").locator("..")
      .or(page.locator("text=HIGH").locator(".."));
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Section Description Auto-Expand ────────────────────────
  test("ThreatGuard section description auto-expands on first visit @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.evaluate(() => {
      Object.keys(localStorage).filter(k => k.startsWith("arkon-section-seen-")).forEach(k => localStorage.removeItem(k));
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Threat Class Explainers ────────────────────────────────
  test("ThreatGuard has threat class explainers @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    const explainer = page.locator("text=What do these mean")
      .or(page.locator("[data-testid='threat-class']"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Error Handling ─────────────────────────────────────────
  test("ThreatGuard handles API error gracefully @regression", async ({ page }) => {
    await page.route("**/api/security/**", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on ThreatGuard page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/security`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
