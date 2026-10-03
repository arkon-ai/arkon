import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Dashboard — comprehensive UI regression ──────── */

// PR-06 pulse-hero rebuild (15a551d, 2026-05-18): the desktop KPI cell is "Events · 24h"; the
// hidden mobile view (md:hidden) still says "Events 24h", which a bare text= locator hit first.
const EVENTS_CELL = "text=/^Events · 24h$/";

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
    const eventsCard = page.locator(EVENTS_CELL);
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
    const eventsCard = page.locator(EVENTS_CELL).locator("..");
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

  // PR-06 replaced the icon+tooltip stat cards with the 6-cell brand-package pulse strip
  // (no icons on desktop cells); assert the strip itself.
  test("pulse strip shows its six labelled cells @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    for (const label of ["Health", "Agents", "Events · 24h", "Burn · 24h", "Threats", "Alerts"]) {
      await expect(page.locator(`[data-tour="dashboard"] >> text=/^${label}$/`).first()).toBeVisible({ timeout: 5000 });
    }
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
    // desktop Events cell sub-line: "<n> tools fired", or the delta "<n>% up|down" once there is a prior day
    const secondary = page.locator(EVENTS_CELL).locator("..").locator("text=/tools fired|% (up|down)/");
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

  // Shell IA refresh (518959d, 2026-05-18): the groups are Provision, Govern, Observe.
  test("sidebar shows all nav groups (PROVISION, GOVERN, OBSERVE) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    for (const group of ["Provision", "Govern", "Observe"]) {
      const section = page.getByRole("button", { name: `Collapse ${group}` });
      await expect(section).toBeVisible({ timeout: 3000 });
    }
  });

  test("sidebar has Quick Access section @regression", async ({ page }) => {
    // Quick Access renders only with pinned docs; the E2E seed pins none (a seeded pin would put the
    // section on every visual baseline), so this test supplies one through the documented endpoint.
    await page.route("**/api/tools/docs?pinned=true*", (route) =>
      route.fulfill({ json: { items: [{ id: 1, title: "E2E pinned doc", category: "Runbook", file_path: null }] } })
    );
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
    // not "networkidle": the dashboard holds an EventSource (/api/dashboard/stream) open, so the
    // network is never idle. Wait for the first data render plus one poll window instead.
    await expect(page.locator(EVENTS_CELL)).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(3000);
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
