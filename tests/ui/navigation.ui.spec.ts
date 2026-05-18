import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

// All pages use client-side auth check — they render the shell, then
// the JS reads the cookie. We test that pages return HTTP 200 and render
// the main shell element.

const PAGES = [
  { path: "/", label: "Dashboard" },
  { path: "/activity", label: "Activity" },
  { path: "/admin", label: "Admin" },
  { path: "/agents", label: "Agents" },
  { path: "/security", label: "ThreatGuard" },
  { path: "/costs", label: "Costs" },
  { path: "/workflows", label: "Workflows" },
  { path: "/infrastructure", label: "Infrastructure" },
  { path: "/analytics", label: "Anomaly Detection" },
  { path: "/benchmarks", label: "Benchmarks" },
  { path: "/compliance", label: "Compliance" },
  { path: "/integrations/approvals", label: "Approvals" },
  { path: "/integrations/calendar", label: "Calendar" },
  { path: "/integrations/command", label: "Commands" },
  { path: "/integrations/docs", label: "Docs" },
  { path: "/integrations/tasks", label: "Tasks" },
  { path: "/integrations/crons", label: "Cron Jobs" },
  { path: "/integrations/intake", label: "Intake" },
  { path: "/integrations/mcp", label: "MCP Servers" },
  { path: "/integrations/mcp-gateway", label: "MCP Gateway" },
  { path: "/settings/notifications", label: "Notification Settings" },
  { path: "/help/glossary", label: "Glossary" },
];

test.describe("Page Navigation", () => {
  test.beforeEach(async ({ context }) => {
    // Set auth cookie before each test
    const res = await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  for (const { path, label } of PAGES) {
    const smoke = path === "/" || path === "/login" ? " @smoke" : "";
    test(`${label} page (${path}) loads with HTTP 200${smoke} @regression`, async ({ page }) => {
      const response = await page.goto(`${MC_URL}${path}`);
      expect(response?.status()).toBe(200);
    });

    test(`${label} page (${path}) renders main content${smoke} @regression`, async ({ page }) => {
      await page.goto(`${MC_URL}${path}`);
      // Page should have a body with content
      await expect(page.locator("body")).not.toBeEmpty();
      // Should not show a raw error page
      const title = await page.title();
      expect(title).not.toContain("500");
      expect(title).not.toContain("Error");
    });
  }
});
