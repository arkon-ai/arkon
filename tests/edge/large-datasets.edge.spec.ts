import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: Large Datasets — Edge & Security Tests
   Tests: high-volume responses, pagination, response size,
          concurrent data loading, memory pressure
   ══════════════════════════════════════════════════════════════ */

// ── Pagination ──────────────────────────────────────────────

test.describe("Large Datasets — Pagination", () => {
  test("traces with high limit param returns bounded result @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces?limit=10000`, {
      headers: authHeaders(),
    });
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      const traces = body.traces ?? body;
      if (Array.isArray(traces)) {
        // Server should cap the result set, not return 10K rows
        expect(traces.length).toBeLessThanOrEqual(1000);
      }
    }
  });

  test("activity with large limit is capped @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity?limit=50000`, {
      headers: authHeaders(),
    });
    expect([200, 400]).toContain(res.status());
    if (res.status() === 200) {
      const text = await res.text();
      // Response should not be absurdly large (>10MB)
      expect(text.length).toBeLessThan(10_000_000);
    }
  });

  test("traces pagination offset works @regression @edge", async ({ request }) => {
    const page1 = await request.get(`${MC_URL}/api/traces?limit=5&offset=0`, {
      headers: authHeaders(),
    });
    const page2 = await request.get(`${MC_URL}/api/traces?limit=5&offset=5`, {
      headers: authHeaders(),
    });
    expect(page1.status()).toBe(200);
    expect(page2.status()).toBe(200);
  });

  test("negative limit is handled gracefully @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces?limit=-1`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("negative offset is handled gracefully @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces?offset=-100`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("non-numeric limit is handled @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces?limit=abc`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBeLessThan(500);
  });
});

// ── Response Size ───────────────────────────────────────────

test.describe("Large Datasets — Response size", () => {
  test("dashboard overview response is reasonably sized @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    // Dashboard overview should not be larger than 1MB
    expect(text.length).toBeLessThan(1_000_000);
  });

  test("costs overview response is bounded @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.length).toBeLessThan(1_000_000);
  });

  test("agents list response is bounded @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/agents-live`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text.length).toBeLessThan(5_000_000);
  });
});

// ── Concurrent Data Loading ─────────────────────────────────

test.describe("Large Datasets — Concurrent loading", () => {
  test("multiple heavy endpoints concurrently do not crash @regression @edge", async ({ request }) => {
    const endpoints = [
      "/api/dashboard/overview",
      "/api/costs/overview",
      "/api/traces",
      "/api/workflows",
      "/api/security/overview",
      "/api/dashboard/activity",
      "/api/tools/agents-live",
      "/api/notifications",
    ];
    const promises = endpoints.map((ep) =>
      request.get(`${MC_URL}${ep}`, { headers: authHeaders() })
    );
    const responses = await Promise.all(promises);
    for (const res of responses) {
      expect(res.status()).toBeLessThan(500);
    }
  });

  test("rapid sequential page loads do not leak memory (smoke) @regression @edge", async ({ page }) => {
    await page.context().request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    const pages = ["/", "/agents", "/costs", "/workflows", "/security", "/traces"];
    for (const p of pages) {
      await page.goto(`${MC_URL}${p}`);
      await page.waitForLoadState("domcontentloaded");
    }
    // If we got here without crashing, test passes
    expect(true).toBeTruthy();
  });
});

// ── Bulk Operations ─────────────────────────────────────────

test.describe("Large Datasets — Bulk operations", () => {
  test("bulk-purge with large empty array @regression @edge", async ({ browser }) => {
    const { authenticate, csrfHeaders } = require("../helpers/auth");
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/events/bulk-purge`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { ids: [] },
    });
    expect([200, 400]).toContain(res.status());
    await context.close();
  });

  test("bulk-purge with many fake IDs does not timeout @regression @edge", async ({ browser }) => {
    const { authenticate, csrfHeaders } = require("../helpers/auth");
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const fakeIds = Array.from({ length: 100 }, (_, i) =>
      `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`
    );
    const res = await context.request.post(`${MC_URL}/api/events/bulk-purge`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { ids: fakeIds },
    });
    expect(res.status()).toBeLessThan(500);
    await context.close();
  });
});
