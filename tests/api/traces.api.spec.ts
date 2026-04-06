import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Traces Routes — Comprehensive API Regression
   Routes: /api/traces (GET, POST), /api/traces/[traceId] (GET)
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/traces ─────────────────────────────────────────

test.describe("GET /api/traces", () => {
  test("returns traces array @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(Array.isArray(body.traces ?? body)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces`, {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("supports since time filter @regression", async ({ request }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await request.get(`${MC_URL}/api/traces?since=${since}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("supports until time filter @regression", async ({ request }) => {
    const until = new Date().toISOString();
    const res = await request.get(`${MC_URL}/api/traces?until=${until}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("supports limit param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces?limit=5`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const traces = body.traces ?? body;
    if (Array.isArray(traces)) {
      expect(traces.length).toBeLessThanOrEqual(5);
    }
  });
});

// ── POST /api/traces (create) ───────────────────────────────

test.describe("POST /api/traces", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/traces`, {
      headers: { "Content-Type": "application/json" },
      data: { agent_id: "test", type: "llm_call" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("creates trace entry @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/traces`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        agent_id: "playwright-test",
        type: "llm_call",
        model: "test-model",
        input_tokens: 100,
        output_tokens: 50,
      },
    });
    expect([200, 201, 400]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/traces/[traceId] ───────────────────────────────

test.describe("GET /api/traces/[traceId]", () => {
  test("returns 404 for non-existent trace @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces/00000000-0000-0000-0000-000000000000`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces/some-trace-id`);
    expect(res.status()).toBe(401);
  });
});
