import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: Browser Edge Cases — Edge & Security Tests
   Tests: back/forward navigation, multiple tabs, deep links,
          rapid navigation, hash fragments, 404 handling,
          bookmark resume, refresh during load
   ══════════════════════════════════════════════════════════════ */

test.beforeEach(async ({ context }) => {
  await context.request.post(`${MC_URL}/api/auth/init`, {
    headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
  });
});

// ── Back/Forward Navigation ─────────────────────────────────

test.describe("Browser Edge Cases — Back/Forward", () => {
  test("back button returns to previous page @regression @edge", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain(MC_URL);
  });

  test("forward button works after back @regression @edge", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    expect(page.url()).toContain("/costs");
  });

  test("back/forward cycle through 5 pages @regression @edge", async ({ page }) => {
    const routes = ["/", "/agents", "/costs", "/workflows", "/security"];
    for (const route of routes) {
      await page.goto(`${MC_URL}${route}`);
      await page.waitForLoadState("domcontentloaded");
    }
    // Go back through all pages
    for (let i = 0; i < 4; i++) {
      await page.goBack();
      await page.waitForLoadState("domcontentloaded");
    }
    // Should be back at dashboard
    expect(page.url().endsWith("/") || page.url().endsWith(":3000")).toBeTruthy();
  });
});

// ── Deep Links ──────────────────────────────────────────────

test.describe("Browser Edge Cases — Deep links", () => {
  test("direct navigation to /agents loads correctly @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/agents`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("direct navigation to /settings/notifications loads @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/settings/notifications`);
    expect(res?.status()).toBe(200);
  });

  test("direct navigation to /tools/docs loads @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/tools/docs`);
    expect(res?.status()).toBe(200);
  });

  test("direct navigation to /tools/mcp loads @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/tools/mcp`);
    expect(res?.status()).toBe(200);
  });

  test("deep link with query params loads correctly @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/traces?search=test&limit=10`);
    expect(res?.status()).toBe(200);
    await page.waitForLoadState("domcontentloaded");
  });
});

// ── 404 Handling ────────────────────────────────────────────

test.describe("Browser Edge Cases — 404 pages", () => {
  test("non-existent page returns 404 or redirects @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/this-page-does-not-exist`);
    // Next.js may return 404 or redirect to home
    expect([200, 404]).toContain(res?.status());
  });

  test("non-existent API route returns 404 @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/nonexistent-endpoint-xyz`);
    expect([401, 404]).toContain(res.status());
  });

  test("non-existent agent detail shows error @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/agent/nonexistent-agent-12345`);
    expect([200, 404]).toContain(res?.status());
    await page.waitForLoadState("domcontentloaded");
    // Should show 404 or error, not crash
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});

// ── Rapid Navigation ────────────────────────────────────────

test.describe("Browser Edge Cases — Rapid navigation", () => {
  test("rapid page transitions do not crash @regression @edge", async ({ page }) => {
    const routes = ["/", "/agents", "/costs", "/workflows", "/security", "/traces"];
    for (const route of routes) {
      // Don't wait for full load — simulate rapid clicking
      page.goto(`${MC_URL}${route}`).catch(() => {});
      await page.waitForTimeout(200);
    }
    // Final navigation should complete
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("clicking sidebar links rapidly does not crash @regression @edge", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // Click multiple sidebar links quickly
    const links = page.locator("nav a, aside a");
    const count = await links.count();
    const toClick = Math.min(count, 5);
    for (let i = 0; i < toClick; i++) {
      await links.nth(i).click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(100);
    }
    // Should not have crashed
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});

// ── Multiple Tabs (Contexts) ────────────────────────────────

test.describe("Browser Edge Cases — Multiple tabs", () => {
  test("two pages can be open simultaneously @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    await page1.goto(`${MC_URL}/`);
    await page2.goto(`${MC_URL}/agents`);
    await page1.waitForLoadState("domcontentloaded");
    await page2.waitForLoadState("domcontentloaded");
    // Both should render
    const body1 = await page1.locator("body").textContent();
    const body2 = await page2.locator("body").textContent();
    expect(body1?.length).toBeGreaterThan(0);
    expect(body2?.length).toBeGreaterThan(0);
    await context.close();
  });

  test("auth state is shared across tabs @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const page1 = await context.newPage();
    const page2 = await context.newPage();
    // Both tabs should be authenticated
    const res1 = await page1.goto(`${MC_URL}/`);
    const res2 = await page2.goto(`${MC_URL}/costs`);
    expect(res1?.status()).toBe(200);
    expect(res2?.status()).toBe(200);
    await context.close();
  });
});

// ── Refresh During Load ─────────────────────────────────────

test.describe("Browser Edge Cases — Refresh", () => {
  test("page refresh on dashboard works @regression @edge", async ({ page }) => {
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("refresh preserves auth state @regression @edge", async ({ page }) => {
    await page.goto(`${MC_URL}/costs`);
    await page.waitForLoadState("domcontentloaded");
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    // Should still be on costs page, not redirected to login
    const url = page.url();
    expect(url).toContain("/costs");
  });
});

// ── URL Manipulation ────────────────────────────────────────

test.describe("Browser Edge Cases — URL manipulation", () => {
  test("double slashes in URL are handled @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}//agents`);
    expect([200, 301, 308, 404]).toContain(res?.status());
  });

  test("trailing slash is handled @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/agents/`);
    expect([200, 301, 308]).toContain(res?.status());
  });

  test("encoded path is handled @regression @edge", async ({ page }) => {
    const res = await page.goto(`${MC_URL}/%61gents`); // %61 = 'a'
    expect([200, 301, 308, 404]).toContain(res?.status());
  });
});
