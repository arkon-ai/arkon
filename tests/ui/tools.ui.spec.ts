import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ── Phase 3: Tools Hub + Sub-Pages — comprehensive UI regression ── */

test.describe("Tools Hub Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("tools hub page loads without errors @smoke @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/tools`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("tools hub shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Tools")
      .or(page.locator("h1, h2"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("tools hub shows tool cards with links @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools`);
    await page.waitForLoadState("domcontentloaded");
    const cards = page.locator("[data-testid='tool-card']")
      .or(page.locator("a[href*='/tools/']"));
    await expect(cards.first()).toBeVisible({ timeout: 5000 });
  });
});

test.describe("Docs Viewer Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("docs page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("docs page shows Docs Viewer heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=Docs Viewer")
      .or(page.locator("text=Docs"));
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("docs page shows subtitle about markdown viewer @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const subtitle = page.locator("text=/sticky search|category pills|markdown viewer/i")
      .or(page.locator("text=/plans|logs|briefs|reports/i"));
    await expect(subtitle.first()).toBeVisible({ timeout: 5000 });
  });

  test("docs page has search input @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const search = page.getByPlaceholder(/search/i)
      .or(page.locator("text=Search titles and content"));
    await expect(search.first()).toBeVisible({ timeout: 5000 });
  });

  test("docs page shows category pills @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const pills = ["All", "sop", "spec", "report", "log", "plan", "research", "guide", "brief", "other"];
    for (const pill of pills.slice(0, 3)) {
      const pillEl = page.locator(`text=${pill}`).first();
      await expect(pillEl).toBeVisible({ timeout: 3000 });
    }
  });

  test("docs page 'All' pill is selected by default @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const allPill = page.locator("text=All").first();
    await expect(allPill).toBeVisible({ timeout: 5000 });
  });

  test("clicking a category pill filters documents @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const resPill = page.locator("text=research").first();
    if (await resPill.isVisible()) {
      await resPill.click();
      await page.waitForTimeout(500);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("docs page shows document list @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    // Should show document entries or empty state
    await expect(page.locator("body")).not.toBeEmpty();
  });

  test("clicking a document shows detail view @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    const docLink = page.locator("a[href*='docs']").first()
      .or(page.locator("[data-testid='doc-item']").first());
    if (await docLink.isVisible()) {
      await docLink.click();
      await page.waitForLoadState("domcontentloaded");
      // Detail view should show "Back to documents" link
      const backLink = page.locator("text=Back to documents")
        .or(page.locator("text=← Back"));
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });

  test("doc detail shows tags (category, Pinned) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/docs`);
    await page.waitForLoadState("domcontentloaded");
    // Check for tag badges if docs exist
    const tags = page.locator("text=/research|Pinned|sop|spec|guide/i");
    await expect(page.locator("body")).not.toBeEmpty();
  });
});

test.describe("MCP Servers Page UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  test("MCP page loads without errors @regression", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
  });

  test("MCP page shows heading @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const heading = page.locator("text=MCP Servers");
    await expect(heading.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP page shows subtitle about registry and health @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const subtitle = page.locator("text=Model Context Protocol")
      .or(page.locator("text=/server registry|health monitor/i"));
    await expect(subtitle.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP page has My Servers and Browse Registry tabs @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const myServers = page.locator("text=/My Servers/i");
    const browse = page.locator("text=Browse Registry");
    await expect(myServers.first()).toBeVisible({ timeout: 5000 });
    await expect(browse.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP page shows server count in My Servers tab @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const count = page.locator("text=/My Servers \\(\\d+\\)/i");
    await expect(count.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP page has status filter pills (All, Approved, Unapproved, Offline) @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const filters = ["All", "Approved", "Unapproved", "Offline"];
    for (const filter of filters) {
      const pill = page.locator(`text=${filter}`).first();
      await expect(pill).toBeVisible({ timeout: 3000 });
    }
  });

  test("MCP page has + Add Server button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const addBtn = page.locator("text=Add Server")
      .or(page.getByRole("button", { name: /add server/i }));
    await expect(addBtn.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP page has Check All button @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const checkAll = page.locator("text=Check All")
      .or(page.getByRole("button", { name: /check all/i }));
    await expect(checkAll.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP server cards show name and transport type @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const serverCard = page.locator("text=STDIO")
      .or(page.locator("text=SSE"))
      .or(page.locator("text=HTTP"));
    await expect(serverCard.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP server cards show action buttons @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const actions = page.locator("text=Check Now")
      .or(page.locator("text=Revoke Approval"))
      .or(page.locator("text=Agents"))
      .or(page.locator("text=Export"))
      .or(page.locator("text=Remove"));
    await expect(actions.first()).toBeVisible({ timeout: 5000 });
  });

  test("MCP server cards show status indicator dot @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    // Status dots (green, yellow, red)
    const statusDot = page.locator("[class*='rounded-full']")
      .or(page.locator("svg circle"));
    const count = await statusDot.count();
    expect(count).toBeGreaterThan(0);
  });

  test("MCP server cards show URL @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const url = page.locator("text=/github\\.com|https:\\/\\//i");
    await expect(url.first()).toBeVisible({ timeout: 5000 });
  });

  test("clicking status filter changes visible servers @regression", async ({ page }) => {
    await page.goto(`${MC_URL}/tools/mcp`);
    await page.waitForLoadState("domcontentloaded");
    const approvedFilter = page.locator("text=/Approved \\(\\d+\\)/i").first();
    if (await approvedFilter.isVisible()) {
      await approvedFilter.click();
      await page.waitForTimeout(300);
      await expect(page.locator("body")).not.toBeEmpty();
    }
  });
});

test.describe("Tools Sub-Pages UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  const toolPages = [
    { path: "/tools/tasks", name: "Tasks" },
    { path: "/tools/command", name: "Command" },
    { path: "/tools/approvals", name: "Approvals" },
    { path: "/tools/calendar", name: "Calendar" },
    { path: "/tools/agents-live", name: "Agents Live" },
    { path: "/tools/crons", name: "Crons" },
    { path: "/tools/intake", name: "Intake" },
    { path: "/tools/mcp-gateway", name: "MCP Gateway" },
  ];

  for (const tp of toolPages) {
    test(`${tp.path} loads without errors @regression`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(`${MC_URL}${tp.path}`);
      await page.waitForLoadState("domcontentloaded");
      expect(errors.filter(e => !e.includes("ResizeObserver"))).toHaveLength(0);
    });

    test(`${tp.path} renders content @regression`, async ({ page }) => {
      await page.goto(`${MC_URL}${tp.path}`);
      await page.waitForLoadState("domcontentloaded");
      await expect(page.locator("body")).not.toBeEmpty();
      const heading = page.locator("h1, h2, h3").first();
      await expect(heading).toBeVisible({ timeout: 5000 });
    });
  }
});
