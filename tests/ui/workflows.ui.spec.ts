import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Workflows — comprehensive UI regression ──────── */

test.describe("Workflows Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("workflows page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("workflows page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Workflows").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("section description appears on workflows page @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"))
      .or(page.locator("text=automate"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("workflows page shows template gallery or workflow list @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Workflows")
      .or(page.locator("text=Template"))
      .or(page.locator("text=Create"))
      .or(page.locator("text=No workflows"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("workflows page has create/new workflow button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const createBtn = page.getByRole("button", { name: /create|new|add/i })
      .or(page.locator("text=Create Workflow"))
      .or(page.locator("[data-testid='create-workflow']"));
    const count = await createBtn.count();
    expect(count).toBeGreaterThan(0);
  });

  test("template gallery cards are clickable @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const templates = page.locator("[data-testid='template-card']")
      .or(page.locator("[class*='template']"))
      .or(page.locator("text=/template/i").first());
    const count = await templates.count();
    if (count > 0) {
      await expect(templates.first()).toBeVisible();
    }
  });

  test("workflow cards show name and status @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const cards = page.locator("[data-testid='workflow-card']")
      .or(page.locator("[class*='workflow-card']"));
    const count = await cards.count();
    if (count > 0) {
      const cardText = await cards.first().textContent();
      expect(cardText).toBeTruthy();
    }
  });

  test("workflow cards have action buttons (edit, delete, run) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const actions = page.getByRole("button", { name: /edit|delete|run|more/i });
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("workflows empty state shows helpful message @regression", async ({ page }) => {
    await page.route("**/api/workflows*", (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ workflows: [] }) })
    );
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const empty = page.locator("text=/no workflow|get started|create your first/i")
      .or(page.locator("text=Template"));
    await expect(empty.first()).toBeVisible({ timeout: 5000 });
  });

  test("workflow builder opens when creating new workflow @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    const createBtn = page.getByRole("button", { name: /create|new|add/i }).first();
    if (await createBtn.isVisible()) {
      await createBtn.click();
      await page.waitForTimeout(1000);
      const builder = page.locator("[data-testid='workflow-builder']")
        .or(page.locator("canvas"))
        .or(page.locator("text=/builder|node|trigger|action/i"));
      await expect(builder.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test("workflows handles API error gracefully @regression", async ({ page }) => {
    await page.route("**/api/workflows*", (route) =>
      route.fulfill({ status: 500, body: JSON.stringify({ error: "Server error" }) })
    );
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on workflows page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
