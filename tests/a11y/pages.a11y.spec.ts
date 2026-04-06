import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { MC_URL, ADMIN_TOKEN } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Accessibility — All Pages (WCAG 2.1 AA)
   axe-core scan on every page to catch violations automatically.
   Tags: @a11y @regression
   ══════════════════════════════════════════════════════════════ */

/** Pages that require authentication */
const AUTHED_PAGES = [
  { path: "/", name: "Dashboard" },
  { path: "/agents", name: "Agents" },
  { path: "/workflows", name: "Workflows" },
  { path: "/costs", name: "Costs" },
  { path: "/admin", name: "Admin" },
  { path: "/security", name: "Security" },
  { path: "/infrastructure", name: "Infrastructure" },
  { path: "/traces", name: "Traces" },
  { path: "/settings", name: "Settings" },
  { path: "/settings/appearance", name: "Settings - Appearance" },
  { path: "/settings/notifications", name: "Settings - Notifications" },
  { path: "/settings/sessions", name: "Settings - Sessions" },
  { path: "/compliance", name: "Compliance" },
  { path: "/analytics", name: "Analytics" },
  { path: "/victoryos", name: "VictoryOS" },
  { path: "/tools", name: "Tools" },
  { path: "/tools/tasks", name: "Tools - Tasks" },
  { path: "/tools/docs", name: "Tools - Docs" },
  { path: "/tools/commands", name: "Tools - Commands" },
  { path: "/tools/approvals", name: "Tools - Approvals" },
  { path: "/tools/mcp", name: "Tools - MCP" },
  { path: "/tools/calendar", name: "Tools - Calendar" },
  { path: "/tools/agents-live", name: "Tools - Agents Live" },
  { path: "/incidents", name: "Incidents" },
  { path: "/notifications", name: "Notifications" },
  { path: "/help", name: "Help" },
];

/** Pages that do NOT require authentication */
const PUBLIC_PAGES = [
  { path: "/login", name: "Login" },
  { path: "/setup", name: "Setup Wizard" },
];

// Known violations to exclude temporarily (e.g., third-party components)
const EXCLUDED_RULES: string[] = [];

test.describe("Accessibility — Authenticated Pages @a11y @regression", () => {
  test.beforeEach(async ({ context }) => {
    await context.request.post(`${MC_URL}/api/auth/init`, {
      headers: { Authorization: `Bearer ${ADMIN_TOKEN}` },
    });
  });

  for (const { path, name } of AUTHED_PAGES) {
    test(`${name} (${path}) passes WCAG 2.1 AA`, async ({ page }) => {
      await page.goto(`${MC_URL}${path}`);
      await page.waitForLoadState("domcontentloaded");
      // Allow dynamic content to render
      await page.waitForTimeout(500);

      const builder = new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]);

      if (EXCLUDED_RULES.length > 0) {
        builder.disableRules(EXCLUDED_RULES);
      }

      const results = await builder.analyze();

      // Soft-assert: collect violation summaries for debugging
      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      }));

      expect(
        violations,
        `${name} has ${violations.length} a11y violations:\n${JSON.stringify(violations, null, 2)}`
      ).toHaveLength(0);
    });
  }
});

test.describe("Accessibility — Public Pages @a11y @regression", () => {
  for (const { path, name } of PUBLIC_PAGES) {
    test(`${name} (${path}) passes WCAG 2.1 AA`, async ({ page }) => {
      await page.goto(`${MC_URL}${path}`);
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const violations = results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        description: v.description,
        nodes: v.nodes.length,
      }));

      expect(
        violations,
        `${name} has ${violations.length} a11y violations:\n${JSON.stringify(violations, null, 2)}`
      ).toHaveLength(0);
    });
  }
});
