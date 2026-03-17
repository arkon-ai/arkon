import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders } from "./helpers/auth";

test.describe("Tools API", () => {
  const routes = [
    "/api/tools/approvals",
    "/api/tools/calendar",
    "/api/tools/commands",
    "/api/tools/docs",
    "/api/tools/tasks",
    "/api/tools/agents-live",
    "/api/tools/mcp",
  ];

  for (const route of routes) {
    test(`GET ${route} returns 200 with auth`, async ({ request }) => {
      const res = await request.get(`${MC_URL}${route}`, { headers: authHeaders() });
      expect(res.status()).toBe(200);
    });

    test(`GET ${route} returns 401 without auth`, async ({ request }) => {
      const res = await request.get(`${MC_URL}${route}`);
      expect(res.status()).toBe(401);
    });
  }

  test("GET /api/tools/mcp-registry returns 200 with auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.servers)).toBeTruthy();
  });

  test("GET /api/tools/mcp-registry search works (search=notion)", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry?search=notion`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.servers)).toBeTruthy();
    // Should find notion-related servers
    expect(body.servers.length).toBeGreaterThan(0);
  });

  test("GET /api/tools/mcp returns pre-seeded servers", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const servers: Array<{ name: string }> = body.servers ?? body ?? [];
    const names = servers.map((s) => s.name);
    expect(names).toContain("Filesystem");
    expect(names).toContain("Git");
    expect(names).toContain("Memory");
  });
});

test.describe("Cron Jobs API", () => {
  test("GET /api/admin/crons returns 200", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/crons`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.jobs ?? body)).toBeTruthy();
  });
});
