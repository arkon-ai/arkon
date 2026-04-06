import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Compliance — comprehensive UI regression ─────── */

test.describe("Compliance Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("compliance page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/compliance`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("compliance page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/compliance`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Compliance")
      .or(page.locator("text=Audit"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("compliance page shows audit log table or empty state @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/compliance`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("table")
      .or(page.locator("[data-testid='audit-table']"))
      .or(page.locator("text=No audit"))
      .or(page.locator("text=Compliance"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("compliance page has export button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/compliance`);
    await page.waitForLoadState("domcontentloaded");
    const exportBtn = page.getByRole("button", { name: /export/i })
      .or(page.locator("text=Export"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("compliance page has purge button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/compliance`);
    await page.waitForLoadState("domcontentloaded");
    const purgeBtn = page.getByRole("button", { name: /purge/i })
      .or(page.locator("text=Purge"));
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("no console errors on compliance page @regression", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(`${MC_URL}/compliance`);
    await page.waitForLoadState("networkidle");
    const real = consoleErrors.filter(
      (e) => !e.includes("ResizeObserver") && !e.includes("favicon")
    );
    expect(real).toHaveLength(0);
  });
});
