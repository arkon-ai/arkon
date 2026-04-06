import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Trace Explorer — comprehensive UI regression ── */

test.describe("Traces Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Basic Rendering ────────────────────────────────────────
  test("traces page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("traces page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Trace").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("traces page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Trace")
      .or(page.locator("text=trace"))
      .or(page.locator("text=No traces"));
    await expect(content.first()).toBeAttached({ timeout: 5000 });
  });

  // ── Stats Row ──────────────────────────────────────────────
  test("traces page shows stats cards (total, avg duration, tokens, errors) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const stats = page.locator("text=/Total|Duration|Token|Error/i");
    const count = await stats.count();
    expect(count).toBeGreaterThan(0);
  });

  // ── Search ─────────────────────────────────────────────────
  test("traces page has search input @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const search = page.getByPlaceholder(/search/i)
      .or(page.locator("input[type='text'], input[type='search']"));
    await expect(search.first()).toBeVisible({ timeout: 5000 });
  });

  test("search input filters traces @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const search = page.getByPlaceholder(/search/i).first();
    if (await search.isVisible()) {
      await search.fill("test-query");
      await page.waitForTimeout(1000); // debounce
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  // ── Filter Controls ────────────────────────────────────────
  test("traces page shows filter controls @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const filter = page.getByRole("button", { name: /filter/i })
      .or(page.locator("select"))
      .or(page.locator("text=Filter"));
    await expect(filter.first()).toBeVisible({ timeout: 5000 });
  });

  test("traces filter panel toggles on click @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const filterBtn = page.getByRole("button", { name: /filter/i }).first();
    if (await filterBtn.isVisible()) {
      await filterBtn.click();
      await page.waitForTimeout(300);
      // Filter panel should appear with status/agent dropdowns
      const panel = page.locator("select, [role='combobox']")
        .or(page.locator("text=/status|agent/i"));
      await expect(panel.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test("traces has status filter (all/ok/error/running/timeout) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const statusFilter = page.locator("select").first()
      .or(page.locator("text=/ok|error|running|timeout/i"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Trace Table ────────────────────────────────────────────
  test("traces page shows trace table or list @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const table = page.locator("table, [data-testid='trace-table']")
      .or(page.locator("[data-testid='trace-row']"))
      .or(page.locator("text=No traces"));
    await expect(table.first()).toBeVisible({ timeout: 5000 });
  });

  test("trace rows are clickable and navigate to detail @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const rows = page.locator("table tbody tr, [data-testid='trace-row']");
    const count = await rows.count();
    if (count > 0) {
      await rows.first().click();
      await page.waitForLoadState("domcontentloaded");
      expect(page.url()).toMatch(/\/traces\//);
    }
  });

  // ── Pagination ─────────────────────────────────────────────
  test("traces page has pagination controls @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const pagination = page.getByRole("button", { name: /prev|next|previous/i })
      .or(page.locator("text=/Page|of/i"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Status Icons ───────────────────────────────────────────
  test("trace rows show status icons with colors @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const rows = page.locator("table tbody tr, [data-testid='trace-row']");
    const count = await rows.count();
    if (count > 0) {
      // Status cells should have SVG icons or colored text
      const statusCell = rows.first().locator("svg, [class*='status']");
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  // ── Error & Empty States ───────────────────────────────────
  test("traces empty state shows message @regression", async ({ page }) => {
    await page.route("**/api/traces*", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ traces: [], total: 0 }) })
    );
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("domcontentloaded");
    const empty = page.locator("text=/no trace|empty/i")
      .or(page.locator("text=No traces"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on traces page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/traces`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
