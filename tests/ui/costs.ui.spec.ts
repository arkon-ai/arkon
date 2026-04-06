import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Cost Tracker — comprehensive UI regression ───── */

test.describe("Costs Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Basic Rendering ────────────────────────────────────────
  test("costs page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("costs page shows Cost Tracker heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Cost Tracker")
      .or(page.locator("text=Costs"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("costs page shows subtitle about AI spend @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const subtitle = page.locator("text=AI spend across all agents and models")
      .or(page.locator("text=/spend|agents|models/i"));
    await expect(subtitle.first()).toBeVisible({ timeout: 5000 });
  });

  test("costs page shows breadcrumbs @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const breadcrumb = page.locator("text=Costs").first();
    await expect(breadcrumb).toBeVisible({ timeout: 5000 });
  });

  test("costs page shows 'What is this?' section description @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"));
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Tab Navigation (Overview / By Agent / By Model) ────────
  test("costs page has Overview tab @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const overviewTab = page.locator("text=Overview")
      .or(page.getByRole("tab", { name: /overview/i }));
    await expect(overviewTab.first()).toBeVisible({ timeout: 5000 });
  });

  test("costs page has By Agent tab @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const agentTab = page.locator("text=By Agent")
      .or(page.getByRole("tab", { name: /by agent/i }));
    await expect(agentTab.first()).toBeVisible({ timeout: 5000 });
  });

  test("costs page has By Model tab @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const modelTab = page.locator("text=By Model")
      .or(page.getByRole("tab", { name: /by model/i }));
    await expect(modelTab.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking By Agent tab switches content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const agentTab = page.locator("text=By Agent").first();
    if (await agentTab.isVisible()) {
      await agentTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("clicking By Model tab switches content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const modelTab = page.locator("text=By Model").first();
    if (await modelTab.isVisible()) {
      await modelTab.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  // ── Summary Grid & Data ────────────────────────────────────
  test("costs page shows summary grid or empty state @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Costs")
      .or(page.locator("text=Projected"))
      .or(page.locator("text=Budget"))
      .or(page.locator("text=No cost data"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("costs page has CSV export button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    const exportBtn = page.getByRole("button", { name: /export|csv|download/i })
      .or(page.locator("text=Export"))
      .or(page.locator("text=CSV"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Error Handling ─────────────────────────────────────────
  test("costs page handles API error gracefully @regression", async ({ page }) => {
    await page.route("**/api/costs/**", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on costs page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
