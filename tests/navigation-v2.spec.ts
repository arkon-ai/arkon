import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN } from "./helpers/auth";

/**
 * Complete page navigation test — covers ALL routes including
 * Phase 3-5 additions (traces, sessions, client portal, API keys).
 */

const ALL_PAGES = [
  // Observe
  { path: "/", label: "Dashboard" },
  { path: "/activity", label: "Activity" },
  { path: "/agents", label: "Agents" },
  { path: "/analytics", label: "Anomaly Detection" },
  { path: "/infrastructure", label: "Infrastructure" },
  { path: "/traces", label: "Traces" },
  { path: "/victoryos", label: "VictoryOS" },
  // Respond
  { path: "/security", label: "ThreatGuard" },
  { path: "/tools/command", label: "Command" },
  { path: "/tools/approvals", label: "Approvals" },
  { path: "/tools/agents-live", label: "Live Agents" },
  { path: "/workflows", label: "Workflows" },
  { path: "/tools/crons", label: "Cron Jobs" },
  { path: "/tools/tasks", label: "Tasks" },
  // Manage
  { path: "/costs", label: "Costs" },
  { path: "/compliance", label: "Compliance" },
  { path: "/benchmarks", label: "Benchmarks" },
  { path: "/admin", label: "Admin Panel" },
  // Configure
  { path: "/settings", label: "Settings" },
  { path: "/settings/sessions", label: "Sessions" },
  { path: "/settings/notifications", label: "Notification Settings" },
  { path: "/tools/docs", label: "Docs" },
  { path: "/tools/mcp", label: "MCP Servers" },
  { path: "/tools/mcp-gateway", label: "MCP Gateway" },
  { path: "/tools/intake", label: "Client Intake" },
  { path: "/tools/calendar", label: "Calendar" },
  { path: "/help/glossary", label: "Glossary" },
  // Client Portal
  { path: "/client", label: "Client Portal" },
  { path: "/client/agents", label: "Client Agents" },
  { path: "/client/costs", label: "Client Costs" },
  { path: "/client/api-keys", label: "Client API Keys" },
  // Auth pages (no auth needed, should still return 200)
  { path: "/login", label: "Login" },
];

test.describe("All Pages — HTTP 200 + no crash @smoke", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  for (const { path, label } of ALL_PAGES) {
    test(`${label} (${path}) returns 200`, async ({ page }) => {
      const response = await page.goto(`${MC_URL}${path}`);
      expect(response?.status()).toBe(200);
    });
  }
});

test.describe("All Pages — no JS errors", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  for (const { path, label } of ALL_PAGES) {
    test(`${label} (${path}) renders without JS errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));
      await page.goto(`${MC_URL}${path}`);
      await page.waitForLoadState("domcontentloaded");
      // ResizeObserver errors are benign browser noise
      const real = errors.filter(e => !e.includes("ResizeObserver"));
      expect(real).toHaveLength(0);
    });
  }
});
