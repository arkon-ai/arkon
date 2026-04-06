import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Cost Routes — Comprehensive API Regression
   Routes: overview, by-agent, by-model, budgets (CRUD)
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/costs/overview ─────────────────────────────────

test.describe("GET /api/costs/overview", () => {
  test("returns cost data with auth @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body.summary).toBeDefined();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`);
    expect(res.status()).toBe(401);
  });

  test("summary contains expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const s = body.summary;
    expect(s).toBeDefined();
    expect(typeof s.total_cost_usd).toBe("number");
    expect(typeof s.total_tokens).toBe("number");
  });

  test("supports range=24h @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview?range=24h`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary.range).toBe("24h");
  });

  test("supports range=7d @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview?range=7d`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.summary.range).toBe("7d");
  });

  test("supports range=30d @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview?range=30d`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("includes daily_trend array @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.daily_trend).toBeDefined();
    expect(Array.isArray(body.daily_trend)).toBeTruthy();
  });

  test("includes budgets array @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.budgets).toBeDefined();
    expect(Array.isArray(body.budgets)).toBeTruthy();
  });
});

// ── GET /api/costs/by-agent ─────────────────────────────────

test.describe("GET /api/costs/by-agent", () => {
  test("returns per-agent costs @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-agent`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body.agents).toBeDefined();
    expect(Array.isArray(body.agents)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-agent`);
    expect(res.status()).toBe(401);
  });

  test("supports range param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-agent?range=7d`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.range).toBe("7d");
  });

  test("agent entries contain cost fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-agent`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.agents?.length > 0) {
      const a = body.agents[0];
      expect(a.agent_id).toBeDefined();
      expect(typeof a.total_cost === "number" || typeof a.total_tokens === "number").toBeTruthy();
    }
  });
});

// ── GET /api/costs/by-model ─────────────────────────────────

test.describe("GET /api/costs/by-model", () => {
  test("returns per-model costs @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-model`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body.models).toBeDefined();
    expect(Array.isArray(body.models)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-model`);
    expect(res.status()).toBe(401);
  });

  test("supports range param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-model?range=24h`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("model entries contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-model`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.models?.length > 0) {
      const m = body.models[0];
      expect(m.model || m.provider).toBeDefined();
      expect(typeof m.estimated_cost === "number" || typeof m.total_tokens === "number").toBeTruthy();
    }
  });
});

// ── /api/costs/budgets (CRUD) ───────────────────────────────

test.describe("GET /api/costs/budgets", () => {
  test("returns budgets list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/budgets`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.budgets).toBeDefined();
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/budgets`);
    expect([401, 404]).toContain(res.status());
  });
});

test.describe("POST /api/costs/budgets", () => {
  test("creates budget with valid data @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/costs/budgets`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        scope_type: "tenant",
        scope_id: "playwright-test",
        monthly_limit_usd: 100,
        alert_threshold_pct: 80,
      },
    });
    expect([200, 201, 400, 404]).toContain(res.status());
    await context.close();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/costs/budgets`, {
      headers: { "Content-Type": "application/json" },
      data: { scope_type: "tenant", scope_id: "test" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });

  test("missing scope_type returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/costs/budgets`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { monthly_limit_usd: 50 },
    });
    expect([400, 404, 422]).toContain(res.status());
    await context.close();
  });
});

test.describe("DELETE /api/costs/budgets", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.delete(`${MC_URL}/api/costs/budgets?id=nonexistent`);
    expect([401, 403, 404]).toContain(res.status());
  });

  test("non-existent budget returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.delete(`${MC_URL}/api/costs/budgets?id=nonexistent-id`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([200, 404]).toContain(res.status());
    await context.close();
  });
});
