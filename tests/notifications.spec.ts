import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Session 9: Notifications — API + UI regression ────────────── */

test.describe("Notifications API", () => {
  test("GET /api/notifications returns notifications", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/notifications/preferences returns preferences", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications/preferences`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("notifications endpoint requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/notifications`);
    expect(res.status()).toBe(401);
  });
});

test.describe("Notification Bell UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("notification bell icon is visible in header", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("networkidle");
    // Bell icon should be in the header area
    const header = page.locator("header");
    await expect(header).toBeVisible();
    // Bell button exists (may be icon-only)
    const bell = page.locator('[aria-label*="notification" i]')
      .or(page.locator('[aria-label*="bell" i]'))
      .or(page.locator("header button").nth(2));
    await expect(bell.first()).toBeVisible({ timeout: 5000 });
  });

  test("notification settings page loads", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/settings/notifications`);
    await page.waitForLoadState("networkidle");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
    // Should show notification preferences
    const content = page.locator("text=Notification")
      .or(page.locator("text=Channel"))
      .or(page.locator("text=Telegram"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });
});
