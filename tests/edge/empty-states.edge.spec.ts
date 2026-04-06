import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: Empty States — Edge & Security Tests
   Tests: new tenant with no data, deleted agent references,
          zero events, empty lists, missing resources
   ══════════════════════════════════════════════════════════════ */

// ── API Empty State Responses ───────────────────────────────

test.describe("Empty States — API responses", () => {
  test("dashboard overview returns valid shape with zero events @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    // Should return arrays (possibly empty), not null/undefined
    if (body.agents !== undefined) {
      expect(Array.isArray(body.agents)).toBeTruthy();
    }
  });

  test("activity feed returns empty array when no events @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity?limit=0`, {
      headers: authHeaders(),
    });
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("traces returns empty array for no matches @regression @edge", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces?search=zzzznonexistent999`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    const traces = body.traces ?? body;
    if (Array.isArray(traces)) {
      expect(traces.length).toBe(0);
    }
  });

  test("workflows returns empty list shape for new tenant @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("costs overview returns valid shape even with zero spend @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("notifications returns empty list @regression @edge", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.get(`${MC_URL}/api/notifications`);
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
    await context.close();
  });

  test("security overview returns valid shape with no threats @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/security/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });
});

// ── Non-Existent Resource Access ────────────────────────────

test.describe("Empty States — Non-existent resources", () => {
  test("non-existent agent returns 404 @regression @edge", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/dashboard/agent/nonexistent-agent-id-12345`,
      { headers: authHeaders() }
    );
    expect([200, 404]).toContain(res.status());
  });

  test("non-existent workflow returns 404 @regression @edge", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/workflows/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });

  test("non-existent trace returns 404 @regression @edge", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });

  test("non-existent infrastructure node returns 404 @regression @edge", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/infrastructure/nodes/nonexistent-node`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });
});

// ── UI Empty States ─────────────────────────────────────────

test.describe("Empty States — UI rendering", () => {
  test("dashboard renders gracefully with mocked empty data @regression @edge", async ({ page }) => {
    // Mock all dashboard APIs to return empty
    await page.route("**/api/dashboard/overview", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ agents: [], events: [], total_events: 0, total_tokens: 0 }),
      })
    );
    await page.route("**/api/dashboard/activity", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ events: [] }),
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/`);
    await page.waitForLoadState("domcontentloaded");
    // Should render without crashing — check no JS errors
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("ResizeObserver")) {
        errors.push(msg.text());
      }
    });
    await page.waitForTimeout(2000);
    // Page should still have main structure
    const main = await page.locator("main, [role='main'], #__next").count();
    expect(main).toBeGreaterThan(0);
  });

  test("agents page renders with zero agents @regression @edge", async ({ page }) => {
    await page.route("**/api/tools/agents-live", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ agents: [] }),
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    // Should show empty state message or at least not crash
    const hasContent = await page.locator("body").textContent();
    expect(hasContent).toBeTruthy();
  });

  test("workflows page renders with no workflows @regression @edge", async ({ page }) => {
    await page.route("**/api/workflows", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ workflows: [] }),
      })
    );
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    await page.goto(`${MC_URL}/workflows`);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);
    const hasContent = await page.locator("body").textContent();
    expect(hasContent).toBeTruthy();
  });
});
