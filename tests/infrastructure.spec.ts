import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Infrastructure, Compliance, Benchmarks — API + UI regression ── */

test.describe("Infrastructure APIs", () => {
  test("GET /api/infra/nodes returns node list", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /api/infra/topology returns topology data", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/topology`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("GET /api/health returns 200", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.status()).toBe(200);
  });

  test("POST /api/infra/report validates payload", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/infra/report`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        nodeId: "playwright-test-node",
        hostname: "playwright-test-node",
        cpu_percent: 25.0,
        memory_percent: 40.0,
        disk_percent: 55.0,
        uptime_seconds: 3600,
      },
    });
    // 200 = accepted, 400 = missing required field, 404 = unknown node
    expect([200, 400, 404]).toContain(res.status());
  });
});

test.describe("Compliance API", () => {
  test("GET /api/compliance/audit-log returns entries", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/audit-log`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });
});

test.describe("Benchmarks API", () => {
  test("GET /api/benchmarks/overview returns data", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/benchmarks/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });
});

test.describe("Infrastructure Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("infrastructure page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("infrastructure page shows topology or node list", async ({ page }) => {
    await page.goto(`${MC_URL}/infrastructure`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("text=Infrastructure")
      .or(page.locator("text=Nodes"))
      .or(page.locator("text=No nodes"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });
});
