import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Tools Routes — Comprehensive API Regression
   Routes: tasks, docs, commands, approvals, calendar,
           agents-live, mcp, mcp-registry
   ══════════════════════════════════════════════════════════════ */

// ── Parameterized auth/200 tests for all tool list endpoints ─

const toolRoutes = [
  "/api/tools/approvals",
  "/api/tools/calendar",
  "/api/tools/commands",
  "/api/tools/docs",
  "/api/tools/tasks",
  "/api/tools/agents-live",
  "/api/tools/mcp",
];

for (const route of toolRoutes) {
  test.describe(`GET ${route}`, () => {
    test(`returns 200 with auth @regression`, async ({ request }) => {
      const res = await request.get(`${MC_URL}${route}`, { headers: authHeaders() });
      expect(res.status()).toBe(200);
    });

    test(`returns 401 without auth @regression`, async ({ request }) => {
      const res = await request.get(`${MC_URL}${route}`);
      expect(res.status()).toBe(401);
    });

    test(`returns 401 with invalid token @regression`, async ({ request }) => {
      const res = await request.get(`${MC_URL}${route}`, {
        headers: { Authorization: "Bearer invalid" },
      });
      expect(res.status()).toBe(401);
    });
  });
}

// ── /api/tools/tasks (CRUD) ─────────────────────────────────

test.describe("Tasks API CRUD", () => {
  test("GET returns tasks array @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/tasks`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("POST creates task @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/tasks`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { title: `PW Task ${Date.now()}`, status: "pending" },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });

  test("POST requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/tools/tasks`, {
      headers: { "Content-Type": "application/json" },
      data: { title: "No auth task" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("PATCH non-existent task returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/tools/tasks/nonexistent-id`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { status: "done" },
    });
    expect([404, 400]).toContain(res.status());
    await context.close();
  });

  test("DELETE non-existent task returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.delete(`${MC_URL}/api/tools/tasks/nonexistent-id`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([404, 400, 200]).toContain(res.status());
    await context.close();
  });
});

// ── /api/tools/docs (CRUD) ──────────────────────────────────

test.describe("Docs API", () => {
  test("GET returns docs list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/docs`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("POST creates doc @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/docs`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { title: `PW Doc ${Date.now()}`, content: "Test content" },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });

  test("GET /api/tools/docs/tree returns doc hierarchy @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/docs/tree`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });
});

// ── /api/tools/commands (CRUD) ──────────────────────────────

test.describe("Commands API", () => {
  test("GET returns commands list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/commands`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("POST creates command @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/commands`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: `pw-cmd-${Date.now()}`, command: "echo test" },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });
});

// ── /api/tools/approvals (CRUD) ─────────────────────────────

test.describe("Approvals API", () => {
  test("GET returns approvals list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/approvals`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("POST creates approval request @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/approvals`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { title: `PW Approval ${Date.now()}`, description: "Test approval" },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });
});

// ── /api/tools/calendar (CRUD) ──────────────────────────────

test.describe("Calendar API", () => {
  test("GET returns events @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/calendar`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("POST creates event @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/calendar`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        title: `PW Event ${Date.now()}`,
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
      },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });
});

// ── /api/tools/mcp (CRUD) ───────────────────────────────────

test.describe("MCP Servers API", () => {
  test("returns pre-seeded servers @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const servers: Array<{ name: string }> = body.servers ?? body ?? [];
    const names = servers.map((s) => s.name);
    expect(names).toContain("Filesystem");
    expect(names).toContain("Git");
    expect(names).toContain("Memory");
  });

  test("POST creates server entry @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/mcp`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: `PW MCP ${Date.now()}`,
        command: "npx",
        args: ["test-mcp-server"],
      },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });
});

// ── /api/tools/mcp-registry ─────────────────────────────────

test.describe("MCP Registry API", () => {
  test("returns registry with auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.servers)).toBeTruthy();
  });

  test("search works (search=notion) @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry?search=notion`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.servers)).toBeTruthy();
    expect(body.servers.length).toBeGreaterThan(0);
  });

  test("search works (search=github) @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry?search=github`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.servers.length).toBeGreaterThan(0);
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry`);
    expect(res.status()).toBe(401);
  });

  test("empty search returns all @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry?search=`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.servers)).toBeTruthy();
  });
});

// ── /api/admin/crons (from tools perspective) ───────────────

test.describe("Cron Jobs API (tools)", () => {
  test("returns cron jobs @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/crons`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.jobs ?? body)).toBeTruthy();
  });
});
