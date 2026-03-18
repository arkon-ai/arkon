import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

/* ── Session 3: Agent Profile — API + UI regression ────────────── */

test.describe("Agent APIs", () => {
  test("GET /api/admin/agents returns agents array", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents ?? body)).toBeTruthy();
  });

  test("GET /api/dashboard/overview returns agent data", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    // Should include agents in some form
    expect(body.agents !== undefined || body.agent_count !== undefined || body.total_agents !== undefined).toBeTruthy();
  });
});

test.describe("Agents Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("agents page loads without errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("agents page shows agent cards or empty state", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    // Should either have agent cards or empty state
    const content = page.locator('[class*="card"], [class*="Card"]')
      .or(page.locator("text=No agents"))
      .or(page.locator("text=Agents"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });
});
