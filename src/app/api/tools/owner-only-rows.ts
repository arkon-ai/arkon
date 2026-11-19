/* THE OWNER-ONLY TABLE (transformate WI-4498, S8): the 101 validateAdmin call rows of the census
   (in/CENSUS-validateAdmin.txt: 66 files, 101 rows at 5ca5730c; the same rows at arkon master dbeceb8e), one row per
   exported handler and method, each at its file:line. Every row moves to the shared OWNER-ONLY check
   (tools/_utils.ts validateOwner). Read by owner-only-census.test.ts (the grep census and the async trap) and by
   owner-only.pg.test.ts (T10). The refusal of every row is the route's current answer: 401 (unauthorized() or its
   inline form); /api/health is PUBLIC and refuses by omitting the system details. Test data, never imported by app code. */

export type HandlerMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface OwnerOnlyRow {
  file: string;
  line: number;
  method: HandlerMethod;
}

export const OWNER_ONLY_ROWS: readonly OwnerOnlyRow[] = [
  { file: "src/app/api/active-runs/route.ts", line: 10, method: "GET" },
  { file: "src/app/api/admin/budgets/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/admin/budgets/route.ts", line: 33, method: "POST" },
  { file: "src/app/api/admin/budgets/route.ts", line: 71, method: "PUT" },
  { file: "src/app/api/admin/budgets/route.ts", line: 106, method: "DELETE" },
  { file: "src/app/api/admin/crons/route.ts", line: 90, method: "GET" },
  { file: "src/app/api/admin/crons/route.ts", line: 107, method: "POST" },
  { file: "src/app/api/analytics/overview/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/arkonos/overview/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/benchmarks/compare/route.ts", line: 7, method: "GET" },
  { file: "src/app/api/benchmarks/overview/route.ts", line: 7, method: "GET" },
  { file: "src/app/api/benchmarks/overview/route.ts", line: 99, method: "POST" },
  { file: "src/app/api/compliance/audit-log/route.ts", line: 7, method: "GET" },
  { file: "src/app/api/compliance/audit-log/route.ts", line: 72, method: "POST" },
  { file: "src/app/api/compliance/export/route.ts", line: 25, method: "GET" },
  { file: "src/app/api/compliance/purge/route.ts", line: 7, method: "POST" },
  { file: "src/app/api/costs/budgets/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/costs/budgets/route.ts", line: 12, method: "POST" },
  { file: "src/app/api/costs/budgets/route.ts", line: 30, method: "PUT" },
  { file: "src/app/api/costs/budgets/route.ts", line: 49, method: "DELETE" },
  { file: "src/app/api/costs/by-agent/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/costs/by-model/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/costs/overview/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/cron/baseline/route.ts", line: 18, method: "POST" },
  { file: "src/app/api/dashboard/activity/route.ts", line: 8, method: "GET" },
  { file: "src/app/api/dashboard/agent/[id]/route.ts", line: 9, method: "GET" },
  { file: "src/app/api/dashboard/anomalies/route.ts", line: 7, method: "GET" },
  { file: "src/app/api/dashboard/anomalies/route.ts", line: 30, method: "PATCH" },
  { file: "src/app/api/dashboard/stream/route.ts", line: 8, method: "GET" },
  { file: "src/app/api/dashboard/trends/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/events/[id]/dismiss/route.ts", line: 11, method: "POST" },
  { file: "src/app/api/events/[id]/purge/route.ts", line: 12, method: "POST" },
  { file: "src/app/api/events/[id]/redact/route.ts", line: 32, method: "POST" },
  { file: "src/app/api/events/bulk-purge/route.ts", line: 8, method: "POST" },
  { file: "src/app/api/fleet/agents/route.ts", line: 73, method: "GET" },
  { file: "src/app/api/health/route.ts", line: 82, method: "GET" },
  { file: "src/app/api/incidents/[id]/route.ts", line: 20, method: "GET" },
  { file: "src/app/api/incidents/[id]/route.ts", line: 62, method: "PATCH" },
  { file: "src/app/api/incidents/[id]/updates/route.ts", line: 10, method: "POST" },
  { file: "src/app/api/incidents/route.ts", line: 9, method: "GET" },
  { file: "src/app/api/incidents/route.ts", line: 63, method: "POST" },
  { file: "src/app/api/infra/collect/route.ts", line: 221, method: "POST" },
  { file: "src/app/api/infra/nodes/[id]/action/route.ts", line: 44, method: "POST" },
  { file: "src/app/api/infra/nodes/[id]/route.ts", line: 11, method: "GET" },
  { file: "src/app/api/infra/nodes/route.ts", line: 8, method: "GET" },
  { file: "src/app/api/infra/topology/route.ts", line: 39, method: "GET" },
  { file: "src/app/api/intake/route.ts", line: 131, method: "GET" },
  { file: "src/app/api/intake/route.ts", line: 150, method: "PATCH" },
  { file: "src/app/api/mcp/gateway/config/route.ts", line: 11, method: "GET" },
  { file: "src/app/api/mcp/gateway/stats/route.ts", line: 11, method: "GET" },
  { file: "src/app/api/push/route.ts", line: 11, method: "POST" },
  { file: "src/app/api/push/route.ts", line: 45, method: "DELETE" },
  { file: "src/app/api/security/overview/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/systems/route.ts", line: 54, method: "GET" },
  { file: "src/app/api/tools/agents-live/[id]/kill/route.ts", line: 12, method: "POST" },
  { file: "src/app/api/tools/agents-live/[id]/pause/route.ts", line: 12, method: "POST" },
  { file: "src/app/api/tools/agents-live/[id]/resume/route.ts", line: 12, method: "POST" },
  { file: "src/app/api/tools/agents-live/[id]/route.ts", line: 10, method: "PATCH" },
  { file: "src/app/api/tools/agents-live/route.ts", line: 7, method: "GET" },
  { file: "src/app/api/tools/agents-live/route.ts", line: 44, method: "POST" },
  { file: "src/app/api/tools/approvals/[id]/route.ts", line: 10, method: "PATCH" },
  { file: "src/app/api/tools/approvals/[id]/route.ts", line: 69, method: "DELETE" },
  { file: "src/app/api/tools/approvals/route.ts", line: 7, method: "GET" },
  { file: "src/app/api/tools/approvals/route.ts", line: 57, method: "POST" },
  { file: "src/app/api/tools/calendar/[id]/route.ts", line: 10, method: "PATCH" },
  { file: "src/app/api/tools/calendar/[id]/route.ts", line: 63, method: "DELETE" },
  { file: "src/app/api/tools/calendar/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/tools/calendar/route.ts", line: 44, method: "POST" },
  { file: "src/app/api/tools/commands/[id]/route.ts", line: 10, method: "GET" },
  { file: "src/app/api/tools/commands/[id]/route.ts", line: 28, method: "PATCH" },
  { file: "src/app/api/tools/commands/[id]/route.ts", line: 65, method: "DELETE" },
  { file: "src/app/api/tools/commands/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/tools/commands/route.ts", line: 29, method: "POST" },
  { file: "src/app/api/tools/docs/[id]/route.ts", line: 16, method: "GET" },
  { file: "src/app/api/tools/docs/[id]/route.ts", line: 34, method: "PATCH" },
  { file: "src/app/api/tools/docs/[id]/route.ts", line: 89, method: "DELETE" },
  { file: "src/app/api/tools/docs/route.ts", line: 13, method: "GET" },
  { file: "src/app/api/tools/docs/route.ts", line: 65, method: "POST" },
  { file: "src/app/api/tools/docs/tree/route.ts", line: 24, method: "GET" },
  { file: "src/app/api/tools/mcp-registry/route.ts", line: 8, method: "GET" },
  { file: "src/app/api/tools/mcp-registry/route.ts", line: 50, method: "POST" },
  { file: "src/app/api/tools/mcp/[id]/agents/route.ts", line: 10, method: "GET" },
  { file: "src/app/api/tools/mcp/[id]/agents/route.ts", line: 33, method: "POST" },
  { file: "src/app/api/tools/mcp/[id]/agents/route.ts", line: 67, method: "DELETE" },
  { file: "src/app/api/tools/mcp/[id]/export/route.ts", line: 10, method: "GET" },
  { file: "src/app/api/tools/mcp/route.ts", line: 29, method: "GET" },
  { file: "src/app/api/tools/mcp/route.ts", line: 78, method: "POST" },
  { file: "src/app/api/tools/mcp/route.ts", line: 109, method: "PATCH" },
  { file: "src/app/api/tools/tasks/[id]/route.ts", line: 10, method: "PATCH" },
  { file: "src/app/api/tools/tasks/[id]/route.ts", line: 65, method: "DELETE" },
  { file: "src/app/api/tools/tasks/reorder/route.ts", line: 6, method: "POST" },
  { file: "src/app/api/tools/tasks/route.ts", line: 6, method: "GET" },
  { file: "src/app/api/tools/tasks/route.ts", line: 53, method: "POST" },
  { file: "src/app/api/workflows/[id]/route.ts", line: 11, method: "GET" },
  { file: "src/app/api/workflows/[id]/route.ts", line: 39, method: "PUT" },
  { file: "src/app/api/workflows/[id]/route.ts", line: 113, method: "DELETE" },
  { file: "src/app/api/workflows/[id]/run/route.ts", line: 12, method: "POST" },
  { file: "src/app/api/workflows/[id]/runs/route.ts", line: 10, method: "GET" },
  { file: "src/app/api/workflows/route.ts", line: 9, method: "GET" },
  { file: "src/app/api/workflows/route.ts", line: 46, method: "POST" },
  { file: "src/app/api/workflows/scheduler/route.ts", line: 8, method: "GET" },
];

/** content-factory/status GET: not a validateAdmin row; it moves to the same check (its mc_token cookie read goes). */
export const CONTENT_FACTORY_GET: OwnerOnlyRow = { file: "src/app/api/content-factory/status/route.ts", line: 60, method: "GET" };

/** The URL path a route file serves, with each [param] filled by "1". */
export function routePath(file: string): string {
  return file.replace(/^src\/app/, "").replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "1");
}
