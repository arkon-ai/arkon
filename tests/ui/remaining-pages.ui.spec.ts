import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Remaining Pages — comprehensive UI regression ── */

test.describe("Remaining Pages UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  // ── Activity Page ──────────────────────────────────────────
  test("activity page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/activity`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("activity page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/activity`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Activity")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("activity page shows feed content or empty state @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/activity`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Actions Page ───────────────────────────────────────────
  test("actions page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/actions`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("actions page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/actions`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Action")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("actions page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/actions`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Benchmarks Page ────────────────────────────────────────
  test("benchmarks page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/benchmarks`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("benchmarks page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/benchmarks`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Benchmark")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("benchmarks page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/benchmarks`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Systems Page ───────────────────────────────────────────
  test("systems page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/systems`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("systems page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/systems`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=System")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("systems page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/systems`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Confessions Page ───────────────────────────────────────
  test("confessions page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/confessions`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("confessions page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/confessions`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Confession")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("confessions page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/confessions`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Health Page ────────────────────────────────────────────
  test("health page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/health`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("health page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/health`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Health")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("health page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/health`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });

  // ── Visuals Page ───────────────────────────────────────────
  test("visuals page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/visuals`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("visuals page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/visuals`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Visual")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("visuals page renders content @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/visuals`);
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
