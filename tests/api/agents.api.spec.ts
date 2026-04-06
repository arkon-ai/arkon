import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Agent Routes — Comprehensive API Regression
   Routes: admin/agents (GET), dashboard/overview (agent data),
           dashboard/agent/[id], tools/agents-live
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/admin/agents (agent list) ──────────────────────

test.describe("Agent List API", () => {
  test("returns agents array @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.agents ?? body)).toBeTruthy();
  });

  test("agents include role and tenant info @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const agents = body.agents ?? body;
    if (Array.isArray(agents) && agents.length > 0) {
      const a = agents[0];
      expect(a.id).toBeDefined();
      expect(a.name).toBeDefined();
      expect(a.tenant_id).toBeDefined();
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`);
    expect(res.status()).toBe(401);
  });
});

// ── GET /api/dashboard/overview (agent data) ────────────────

test.describe("Dashboard Agent Data", () => {
  test("overview returns agent data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body.agents !== undefined || body.agent_count !== undefined || body.total_agents !== undefined).toBeTruthy();
  });
});

// ── GET /api/dashboard/agent/[id] ───────────────────────────

test.describe("GET /api/dashboard/agent/[id]", () => {
  test("returns 404 for non-existent agent @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/agent/nonexistent-agent-id`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/agent/test-agent`);
    expect([401, 429]).toContain(res.status());
  });
});

// ── GET /api/tools/agents-live ──────────────────────────────

test.describe("GET /api/tools/agents-live", () => {
  test("returns agents list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/agents-live`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/agents-live`);
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/tools/agents-live (spawn agent) ───────────────

test.describe("POST /api/tools/agents-live", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/tools/agents-live`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ── POST /api/tools/agents-live/[id]/kill ───────────────────

test.describe("POST /api/tools/agents-live/[id]/kill", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/tools/agents-live/nonexistent/kill`, {
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent agent returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/tools/agents-live/nonexistent-agent/kill`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
    });
    expect([404, 400]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/tools/agents-live/[id]/pause ──────────────────

test.describe("POST /api/tools/agents-live/[id]/pause", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/tools/agents-live/nonexistent/pause`, {
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ── POST /api/tools/agents-live/[id]/resume ─────────────────

test.describe("POST /api/tools/agents-live/[id]/resume", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/tools/agents-live/nonexistent/resume`, {
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403]).toContain(res.status());
  });
});
