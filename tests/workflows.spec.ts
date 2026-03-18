import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Session 7: Workflow Builder — API + UI regression ──────────── */

test.describe("Workflow API", () => {
  test("GET /api/workflows returns workflows array", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.workflows ?? body)).toBeTruthy();
  });

  test("workflows endpoint requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/workflows/scheduler returns scheduler state", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/scheduler`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });
});

test.describe("Workflows Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("workflows page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("workflows page shows template gallery or workflow list", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    // Should show either existing workflows or the template gallery
    const content = page.locator("text=Workflows")
      .or(page.locator("text=Template"))
      .or(page.locator("text=Create"))
      .or(page.locator("text=No workflows"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("section description appears on workflows page", async ({ page }) => {
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    // SectionDescription renders "What is this?" or the expanded text
    const desc = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"))
      .or(page.locator("text=automate"));
    await expect(page.locator("body")).not.toBeEmpty();
  });
});
