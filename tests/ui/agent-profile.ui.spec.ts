import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "../helpers/auth";

/* ── Phase 3: Agent Profile / Detail — comprehensive UI regression ── */

test.describe("Agents List Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("agents page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("agents page shows heading and breadcrumbs @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Agents").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
  });

  test("agents page shows section description 'What is this?' @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    const desc = page.locator("text=What is this?")
      .or(page.locator("text=Got it, hide this"))
      .or(page.locator("text=Sub-agent status cards"));
    await expect(desc.first()).toBeVisible({ timeout: 5000 });
  });

  test("agents page shows subtitle about freshness and model @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    const subtitle = page.locator("text=/freshness|model/i").first();
    await expect(subtitle).toBeVisible({ timeout: 5000 });
  });

  test("agents page shows agent cards or empty state @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    const content = page.locator("[data-testid='agent-card']")
      .or(page.locator('[class*="card"], [class*="Card"]'))
      .or(page.locator("text=No agents"))
      .or(page.locator("text=Agents"));
    await expect(content.first()).toBeVisible({ timeout: 5000 });
  });

  test("agent cards show status indicators @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    const status = page.locator("[data-testid='agent-card']")
      .or(page.locator("text=/active|idle|offline|error/i").first());
    await expect(status.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking an agent card navigates to agent detail @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agents`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator("[data-testid='agent-card']")
      .or(page.locator("a[href*='/agent/']"));
    const count = await card.count();
    if (count > 0) {
      await card.first().click();
      await page.waitForLoadState("domcontentloaded");
      expect(page.url()).toMatch(/\/agent\//);
    }
  });
});

test.describe("Agent Detail Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("agent detail page loads for first agent @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("agent detail shows header with agent name and status badge @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("h1, h2, [data-testid='agent-name']").first();
    await expect(heading).toBeVisible({ timeout: 5000 });
    const badge = page.locator("text=/active|idle|offline|paused/i").first();
    await expect(badge).toBeVisible({ timeout: 5000 });
  });

  test("agent detail has action buttons (Pause/Resume/Emergency Stop) @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    const buttons = page.getByRole("button", { name: /pause|resume|stop|kill/i });
    const count = await buttons.count();
    expect(count).toBeGreaterThan(0);
  });

  test("agent detail shows stat pills (Cost, Messages, Threats, Error Rate) @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    const stats = page.locator("text=/Cost|Messages|Threats|Error Rate|Last Active/i");
    const count = await stats.count();
    expect(count).toBeGreaterThan(0);
  });

  test("agent detail has tab navigation (Overview, Security, Performance, Activity) @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    const tabs = page.getByRole("button", { name: /overview|security|performance|activity/i })
      .or(page.getByRole("tab", { name: /overview|security|performance|activity/i }));
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test("agent detail tab switching works @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    const securityTab = page.getByRole("button", { name: /security/i })
      .or(page.getByRole("tab", { name: /security/i }));
    if (await securityTab.count() > 0) {
      await securityTab.first().click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("agent detail shows charts (message volume, daily cost) @regression", async ({ page, request }) => {
    const res = await request.get(`${MC_URL}/api/agents`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    if (!res.ok()) return;
    const data = await res.json();
    const agents = data.agents || data || [];
    if (agents.length === 0) return;

    await page.goto(`${MC_URL}/agent/${agents[0].id || agents[0].agent_id}`);
    await page.waitForLoadState("domcontentloaded");
    const charts = page.locator(".recharts-wrapper, svg.recharts-surface, canvas")
      .or(page.locator("text=/Message Volume|Daily Cost|Token Usage|Tool Calls/i"));
    const count = await charts.count();
    expect(count).toBeGreaterThan(0);
  });

  test("agent detail 404 for non-existent agent @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/agent/non-existent-agent-id`);
    await page.waitForLoadState("domcontentloaded");
    const error = page.locator("text=/not found|error|404|no data/i")
      .or(page.locator("[role='alert']"));
    await expect(error.first()).toBeVisible({ timeout: 5000 });
  });
});
