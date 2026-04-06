import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Admin Panel — comprehensive UI regression ────── */

test.describe("Admin Panel Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Basic Rendering ────────────────────────────────────────
  test("/admin page returns 200 @smoke @regression", async ({ page }) => {
    const response = await page.goto(`${MC_URL}/admin`);
    expect(response?.status()).toBe(200);
  });

  test("/admin page renders without 500 error @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    const title = await page.title();
    expect(title).not.toContain("500");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("admin page loads without JS errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("admin page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Admin")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Data Management Section ────────────────────────────────
  test("admin page has Data Management section @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const section = page.locator("text=DATA MANAGEMENT")
      .or(page.locator("text=Data Management"));
    await expect(section.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Manual Event Ingest ────────────────────────────────────
  test("admin page has Manual Event Ingest card @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const ingest = page.locator("text=Manual Event Ingest");
    await expect(ingest.first()).toBeVisible({ timeout: 5000 });
  });

  test("Manual Event Ingest has agent selector @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const agentSelect = page.locator("text=AGENT").locator("..").locator("select, [role='combobox']")
      .or(page.locator("text=Select agent...").first());
    await expect(agentSelect.first()).toBeVisible({ timeout: 5000 });
  });

  test("Manual Event Ingest has event type selector @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const eventType = page.locator("text=EVENT TYPE").first()
      .or(page.locator("text=message — a conversation or chat event"));
    await expect(eventType).toBeVisible({ timeout: 5000 });
  });

  test("Manual Event Ingest has content textarea @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=CONTENT").first()
      .or(page.getByPlaceholder(/describe the event/i));
    await expect(content).toBeVisible({ timeout: 5000 });
  });

  test("Manual Event Ingest has Log Event button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const logBtn = page.locator("text=Log Event")
      .or(page.getByRole("button", { name: /log event/i }));
    await expect(logBtn.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Purge Agent Data ───────────────────────────────────────
  test("admin page has Purge Agent Data section @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const purge = page.locator("text=Purge Agent Data");
    await expect(purge.first()).toBeVisible({ timeout: 5000 });
  });

  test("Purge Agent Data has agent selector @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const agentSelect = page.locator("text=AGENT TO PURGE")
      .or(page.locator("text=Select agent...").nth(1));
    await expect(agentSelect.first()).toBeVisible({ timeout: 5000 });
  });

  test("Purge Agent Data has destructive delete button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const deleteBtn = page.locator("text=Permanently Delete This Agent's Data")
      .or(page.getByRole("button", { name: /permanently delete/i }));
    await expect(deleteBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("Purge Agent Data description explains consequences @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=/Permanently deletes ALL events|tool calls|sessions/i");
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  // ── Error Handling ─────────────────────────────────────────
  test("no console errors on admin page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/admin`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
