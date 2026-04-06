import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Dashboard — comprehensive UI regression ──────── */

test.describe("Dashboard Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Render & Error-Free ────────────────────────────────────
  test("dashboard page renders without JS errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("dashboard shows heading text @smoke @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Dashboard");
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("dashboard shows subtitle description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const subtitle = page.locator("text=Live agent activity")
      .or(page.locator("text=token flow"))
      .or(page.locator("text=system pulse"));
    await expect(subtitle.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Health Gauge ───────────────────────────────────────────
  test("dashboard renders health gauge with score @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const gauge = page.locator("svg circle, [data-testid='health-gauge']")
      .or(page.locator("text=NEEDS ATTENTION"))
      .or(page.locator("text=HEALTHY"))
      .or(page.locator("text=CRITICAL"));
    await expect(gauge.first()).toBeVisible({ timeout: 5000 });
  });

  test("health gauge displays numeric score @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const scoreText = page.locator("[data-testid='health-score']")
      .or(page.locator("text=/^\\d{1,3}$/").first());
    await expect(scoreText).toBeVisible({ timeout: 5000 });
  });

  // ── Status Summary ─────────────────────────────────────────
  test("dashboard shows agent and event summary text @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const summary = page.locator("text=/agents?/i").first();
    await expect(summary).toBeVisible({ timeout: 5000 });
  });

  test("dashboard shows events count in summary @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const events = page.locator("text=/events/i").first();
    await expect(events).toBeVisible({ timeout: 5000 });
  });

  // ── Stat Cards (EVENTS 24H, TOKENS 24H, etc.) ─────────────
  test("dashboard renders EVENTS 24H stat card @smoke @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const eventsCard = page.locator("text=EVENTS 24H");
    await expect(eventsCard.first()).toBeVisible({ timeout: 5000 });
  });

  test("dashboard renders TOKENS 24H stat card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const tokensCard = page.locator("text=TOKENS 24H");
    await expect(tokensCard.first()).toBeVisible({ timeout: 5000 });
  });

  test("EVENTS 24H card shows numeric count and delta @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const eventsCard = page.locator("text=EVENTS 24H").locator("..");
    await expect(eventsCard).toBeVisible({ timeout: 5000 });
    const cardText = await eventsCard.textContent();
    expect(cardText).toMatch(/\d/);
  });

  test("TOKENS 24H card shows count with compact format @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const tokensCard = page.locator("text=TOKENS 24H").locator("..");
    await expect(tokensCard).toBeVisible({ timeout: 5000 });
    const cardText = await tokensCard.textContent();
    expect(cardText).toMatch(/\d/);
  });

  test("stat cards show sparkline SVG charts @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const sparklines = page.locator("svg path, .recharts-wrapper");
    const count = await sparklines.count();
    expect(count).toBeGreaterThan(0);
  });

  test("stat cards have tooltip info icons @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const tooltipIcons = page.locator("text=EVENTS 24H").locator("..").locator("svg");
    const count = await tooltipIcons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("stat cards show percentage delta indicator @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const delta = page.locator("text=/%/").first();
    await expect(delta).toBeVisible({ timeout: 5000 });
  });

  test("stat cards show secondary metrics (tools fired, errors) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const secondary = page.locator("text=/tools fired|errors/i").first();
    await expect(secondary).toBeVisible({ timeout: 5000 });
  });

  // ── Activity Feed ──────────────────────────────────────────
  test("dashboard shows activity feed section @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const activity = page.locator("text=/activity|recent|events/i").first();
    await expect(activity).toBeVisible({ timeout: 5000 });
  });

  // ── Sidebar Navigation ────────────────────────────────────
  test("sidebar navigation shows OBSERVE group @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const observe = page.locator("text=OBSERVE");
    await expect(observe.first()).toBeVisible({ timeout: 5000 });
  });

  test("sidebar shows all nav groups (OBSERVE, RESPOND, MANAGE) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    for (const group of ["OBSERVE", "RESPOND", "MANAGE"]) {
      const section = page.locator(`text=${group}`).first();
      await expect(section).toBeVisible({ timeout: 3000 });
    }
  });

  test("sidebar has Quick Access section @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const quickAccess = page.locator("text=QUICK ACCESS");
    await expect(quickAccess).toBeVisible({ timeout: 5000 });
  });

  // ── Header Elements ────────────────────────────────────────
  test("header has search with Ctrl+K shortcut label @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const search = page.locator("text=Search")
      .or(page.locator("text=Ctrl+K"));
    await expect(search.first()).toBeVisible({ timeout: 5000 });
  });

  test("header has tenant selector @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const tenant = page.locator("text=All Tenants")
      .or(page.locator("text=Tenant"));
    await expect(tenant.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Error States ───────────────────────────────────────────
  test("dashboard handles API error gracefully @regression", async ({ page }) => {
    await page.route("**/api/dashboard/overview", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no uncaught console errors on dashboard @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
