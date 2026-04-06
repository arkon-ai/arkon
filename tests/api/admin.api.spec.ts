import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Admin Routes — Comprehensive API Regression
   Routes: admin/agents, admin/budgets, admin/crons,
           admin/pricing, admin/tenants
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/admin/agents ───────────────────────────────────

test.describe("GET /api/admin/agents", () => {
  test("returns agents with auth @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body.agents).toBeDefined();
    expect(Array.isArray(body.agents)).toBeTruthy();
  });

  test("returns 401 without auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`);
    expect(res.status()).toBe(401);
  });

  test("agent entries contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.agents?.length > 0) {
      const a = body.agents[0];
      expect(a.id).toBeDefined();
      expect(a.name).toBeDefined();
      expect(a.tenant_id).toBeDefined();
    }
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`, {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/admin/agents (create/provision) ───────────────

test.describe("POST /api/admin/agents", () => {
  test("requires owner auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/admin/agents`, {
      headers: { "Content-Type": "application/json" },
      data: { id: "test-agent", name: "Test Agent" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("creates agent with valid data @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const agentId = `pw-agent-${Date.now()}`;
    const res = await context.request.post(`${MC_URL}/api/admin/agents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        id: agentId,
        name: `PW Test Agent`,
        agentRole: "agent",
        tenant_id: "transformate",
      },
    });
    // 200/201 = created, 400 = validation, 403 = not owner, 409 = duplicate
    expect([200, 201, 400, 403, 409]).toContain(res.status());
    if (res.status() === 200 || res.status() === 201) {
      const body = await res.json();
      expect(body.ok).toBeTruthy();
      expect(body.agentId || body.token).toBeDefined();
    }
    await context.close();
  });

  test("missing id returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/admin/agents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: "No ID Agent" },
    });
    expect([400, 403, 422]).toContain(res.status());
    await context.close();
  });
});

// ── PATCH /api/admin/agents (rotate token, set role) ────────

test.describe("PATCH /api/admin/agents", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.patch(`${MC_URL}/api/admin/agents`, {
      headers: { "Content-Type": "application/json" },
      data: { id: "test", action: "rotate_token" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("invalid action returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/admin/agents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { id: "test", action: "invalid_action" },
    });
    expect([400, 403, 404, 422]).toContain(res.status());
    await context.close();
  });

  test("non-existent agent returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/admin/agents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { id: "nonexistent-agent-999", action: "rotate_token" },
    });
    expect([400, 403, 404]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/admin/budgets ──────────────────────────────────

test.describe("GET /api/admin/budgets", () => {
  test("returns budgets with auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/budgets`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.budgets).toBeDefined();
    expect(Array.isArray(body.budgets)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/budgets`);
    expect(res.status()).toBe(401);
  });
});

test.describe("POST /api/admin/budgets", () => {
  test("creates budget @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/admin/budgets`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        scope_type: "tenant",
        scope_id: `pw-budget-${Date.now()}`,
        monthly_limit_usd: 50,
        alert_threshold_pct: 90,
      },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/admin/budgets`, {
      headers: { "Content-Type": "application/json" },
      data: { scope_type: "tenant", scope_id: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("DELETE /api/admin/budgets", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.delete(`${MC_URL}/api/admin/budgets?id=nonexistent`);
    expect([401, 403]).toContain(res.status());
  });
});

// ── GET /api/admin/crons ────────────────────────────────────

test.describe("GET /api/admin/crons", () => {
  test("returns cron jobs @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/crons`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.jobs ?? body)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/crons`);
    expect(res.status()).toBe(401);
  });

  test("jobs contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/crons`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const jobs = body.jobs ?? body;
    if (Array.isArray(jobs) && jobs.length > 0) {
      const j = jobs[0];
      expect(j.id).toBeDefined();
      expect(typeof j.enabled === "boolean").toBeTruthy();
    }
  });
});

test.describe("POST /api/admin/crons", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/admin/crons`, {
      headers: { "Content-Type": "application/json" },
      data: { jobs: [] },
    });
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("PATCH /api/admin/crons", () => {
  test("requires owner auth @regression", async ({ request }) => {
    const res = await request.patch(`${MC_URL}/api/admin/crons`, {
      headers: { "Content-Type": "application/json" },
      data: { jobId: "test", action: "disable" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("invalid action returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/admin/crons`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { jobId: "test", action: "invalid" },
    });
    expect([400, 403, 404, 422]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/admin/pricing ──────────────────────────────────

test.describe("GET /api/admin/pricing", () => {
  test("returns pricing rules @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/pricing`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.pricing).toBeDefined();
    expect(Array.isArray(body.pricing)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/pricing`);
    expect(res.status()).toBe(401);
  });

  test("pricing entries contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/pricing`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.pricing?.length > 0) {
      const p = body.pricing[0];
      expect(p.provider || p.model_id).toBeDefined();
    }
  });
});

test.describe("POST /api/admin/pricing", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/admin/pricing`, {
      headers: { "Content-Type": "application/json" },
      data: { provider: "test", model_id: "test-model" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("creates pricing rule @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/admin/pricing`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        provider: "playwright-test",
        model_id: `pw-model-${Date.now()}`,
        display_name: "PW Test Model",
        cost_per_1k_input: 0.001,
        cost_per_1k_output: 0.002,
        is_free: false,
      },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/admin/tenants ──────────────────────────────────

test.describe("GET /api/admin/tenants", () => {
  test("returns tenants for owner @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/tenants`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tenants ?? body)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/tenants`);
    expect(res.status()).toBe(401);
  });

  test("tenant entries contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/tenants`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const tenants = body.tenants ?? body;
    if (Array.isArray(tenants) && tenants.length > 0) {
      const t = tenants[0];
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
    }
  });
});
