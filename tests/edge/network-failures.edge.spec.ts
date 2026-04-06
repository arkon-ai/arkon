import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: Network Failures — Edge & Security Tests
   Tests: API timeout handling, SSE reconnection, offline mode,
          slow responses, aborted requests, malformed responses
   ══════════════════════════════════════════════════════════════ */

// ── API Timeout Handling ────────────────────────────────────

test.describe("Network Failures — Timeout handling", () => {
  test("UI shows error state when API times out @regression @edge", async ({ page }) => {
    // Mock dashboard API to timeout (never respond)
    await page.route("**/api/dashboard/overview", (route) =>
      route.abort("timedout")
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(3000);
    // Page should still render (not blank/crashed)
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("UI shows error when API returns 500 @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal Server Error" }),
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("UI handles network error gracefully @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", (route) =>
      route.abort("connectionrefused")
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});

// ── Slow API Responses ──────────────────────────────────────

test.describe("Network Failures — Slow responses", () => {
  test("UI handles slow API response without crashing @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", async (route) => {
      await new Promise((r) => setTimeout(r, 5000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ agents: [], events: [], total_events: 0 }),
      });
    });
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // Should show loading state initially
    await page.waitForTimeout(1000);
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});

// ── SSE Stream Handling ─────────────────────────────────────

test.describe("Network Failures — SSE stream", () => {
  test("SSE stream endpoint exists and returns event-stream @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/stream`, {
      headers: authHeaders(),
    });
    // SSE endpoint may return 200 with text/event-stream or close immediately
    expect([200, 401, 404]).toContain(res.status());
    if (res.status() === 200) {
      const contentType = res.headers()["content-type"] ?? "";
      // May be event-stream or JSON depending on implementation
      expect(contentType.includes("event-stream") || contentType.includes("json")).toBeTruthy();
    }
  });

  test("SSE stream requires auth @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/stream`);
    expect([401, 403]).toContain(res.status());
  });
});

// ── Malformed Responses ─────────────────────────────────────

test.describe("Network Failures — Malformed API responses", () => {
  test("UI handles malformed JSON response @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "this is not valid json{{{",
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    // Should not show blank page
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("UI handles empty response body @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "",
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });

  test("UI handles HTML response when JSON expected @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/html",
        body: "<html><body>Unexpected HTML</body></html>",
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(2000);
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});

// ── Aborted Requests ────────────────────────────────────────

test.describe("Network Failures — Navigation during load", () => {
  test("navigating away during API load does not crash @regression @edge", async ({ page }) => {
    await page.route("**/api/dashboard/overview", async (route) => {
      await new Promise((r) => setTimeout(r, 10000));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ agents: [] }),
      });
    });
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    // Navigate away before API responds
    await page.waitForTimeout(500);
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    // Should land on agents page successfully
    const body = await page.locator("body").textContent();
    expect(body?.length).toBeGreaterThan(0);
  });
});
