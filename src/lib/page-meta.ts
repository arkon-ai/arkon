/**
 * Route → page metadata map.
 * Used by breadcrumbs and page headers.
 */

interface PageMeta {
  title: string;
  description: string;
  group?: string;
}

export const pageMeta: Record<string, PageMeta> = {
  "/":                    { title: "Dashboard",         description: "System health overview and key metrics",        group: "Observe" },
  "/activity":            { title: "Activity",          description: "Real-time event stream across all agents",      group: "Observe" },
  "/agents":              { title: "Agents",            description: "Manage and monitor your AI agents",             group: "Observe" },
  "/infrastructure":      { title: "Infrastructure",    description: "Server topology and resource monitoring",        group: "Observe" },
  "/analytics":           { title: "Anomaly Detection", description: "Rate spikes, silence alerts, and anomalies",    group: "Observe" },
  "/costs":               { title: "Costs",             description: "Track spending by agent, model, and provider",   group: "Observe" },
  "/arkonos":           { title: "ArkonOS",         description: "Chat engine metrics and token usage",           group: "Observe" },
  "/security":            { title: "ThreatGuard",       description: "Detect and respond to threats in agent activity", group: "Respond" },
  "/tools/command":       { title: "Command",           description: "Run agent commands directly",                    group: "Respond" },
  "/tools/approvals":     { title: "Approvals",         description: "Review pending agent requests",                  group: "Respond" },
  "/tools/crons":         { title: "Cron Jobs",         description: "Scheduled automations and triggers",             group: "Respond" },
  "/tools/agents-live":   { title: "Live Agents",       description: "Active agent sessions and real-time output",     group: "Respond" },
  "/workflows":           { title: "Workflows",         description: "Automate multi-step operations",                 group: "Respond" },
  "/tools/tasks":         { title: "Tasks",             description: "Track action items and assignments",             group: "Respond" },
  "/benchmarks":          { title: "Benchmarks",        description: "Compare agent and model performance",            group: "Manage" },
  "/compliance":          { title: "Compliance",        description: "Audit logs, data export, and governance",        group: "Manage" },
  "/admin":               { title: "Admin Panel",       description: "System configuration and tenant management",     group: "Manage" },
  "/settings":            { title: "Settings",          description: "Notifications and preferences",                  group: "Configure" },
  "/tools/docs":          { title: "Docs",              description: "Agent documentation and knowledge base",         group: "Configure" },
  "/tools/mcp":           { title: "MCP Servers",       description: "Manage tool providers and connections",          group: "Configure" },
  "/tools/intake":        { title: "Client Intake",     description: "Client onboarding forms and workflows",          group: "Configure" },
  "/tools/calendar":      { title: "Calendar",          description: "Schedule and events",                            group: "Configure" },
  "/client":              { title: "Client Portal",     description: "Client-facing dashboard",                        group: "Client" },
  "/client/agents":       { title: "Client Agents",     description: "Client agent management",                        group: "Client" },
  "/client/events":       { title: "Client Events",     description: "Client event stream",                            group: "Client" },
};

export function getPageMeta(pathname: string): PageMeta {
  return pageMeta[pathname] || { title: "Arkon", description: "" };
}

export function getBreadcrumbs(pathname: string): Array<{ label: string; href: string }> {
  const crumbs: Array<{ label: string; href: string }> = [{ label: "Home", href: "/" }];

  if (pathname === "/") return crumbs;

  const segments = pathname.split("/").filter(Boolean);
  let currentPath = "";

  for (const segment of segments) {
    currentPath += `/${segment}`;
    const meta = pageMeta[currentPath];
    if (meta) {
      crumbs.push({ label: meta.title, href: currentPath });
    } else {
      crumbs.push({ label: segment.charAt(0).toUpperCase() + segment.slice(1), href: currentPath });
    }
  }

  return crumbs;
}
