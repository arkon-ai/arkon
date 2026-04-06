import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: SQL Injection — Edge & Security Tests
   Tests: injection in API filters, search params, path params,
          form data, UNION-based, time-based blind, stacked
   ══════════════════════════════════════════════════════════════ */

const SQL_PAYLOADS = [
  "' OR 1=1 --",
  "'; DROP TABLE events; --",
  "1; SELECT * FROM user_sessions --",
  "' UNION SELECT null, null, null --",
  "1' AND SLEEP(5) --",
  "' OR '1'='1",
  "admin'--",
  "1 OR 1=1",
  "'; TRUNCATE TABLE agents; --",
  "1) OR (1=1",
];

// ── SQL Injection in Query Params ───────────────────────────

test.describe("SQL Injection — Query parameters", () => {
  for (const payload of SQL_PAYLOADS.slice(0, 5)) {
    const label = payload.slice(0, 25).replace(/[';]/g, "_");

    test(`traces search with "${label}" is safe @regression @edge @security`, async ({ request }) => {
      const res = await request.get(
        `${MC_URL}/api/traces?search=${encodeURIComponent(payload)}`,
        { headers: authHeaders() }
      );
      // Should return valid response or 400, never 500
      expect(res.status()).toBeLessThan(500);
    });
  }

  test("activity filter with SQL injection @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/dashboard/activity?type=${encodeURIComponent("' OR 1=1 --")}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("costs by-agent with SQL injection in agent param @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/costs/by-agent?agent=${encodeURIComponent("'; DROP TABLE costs; --")}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBeLessThan(500);
  });

  test("security events with SQL injection in severity filter @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/security/overview?severity=${encodeURIComponent("' UNION SELECT * FROM user_sessions --")}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBeLessThan(500);
  });
});

// ── SQL Injection in Path Parameters ────────────────────────

test.describe("SQL Injection — Path parameters", () => {
  test("agent detail with SQL injection in ID @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/dashboard/agent/${encodeURIComponent("' OR 1=1 --")}`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });

  test("trace detail with SQL injection in traceId @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces/${encodeURIComponent("'; DELETE FROM traces; --")}`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });

  test("workflow detail with SQL injection in ID @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/workflows/${encodeURIComponent("1 OR 1=1")}`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });

  test("event dismiss with SQL injection in ID @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(
      `${MC_URL}/api/events/${encodeURIComponent("'; DROP TABLE events; --")}/dismiss`,
      { headers: csrfHeaders(csrfToken) }
    );
    expect([200, 400, 404]).toContain(res.status());
    await context.close();
  });
});

// ── SQL Injection in POST Body ──────────────────────────────

test.describe("SQL Injection — POST body", () => {
  test("login with SQL injection in email @regression @edge @security", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "' OR 1=1 --", password: "test" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("login with SQL injection in password @regression @edge @security", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/auth/login`, {
      headers: { "Content-Type": "application/json" },
      data: { email: "test@test.com", password: "' OR '1'='1" },
    });
    expect([400, 401, 422]).toContain(res.status());
  });

  test("ingest with SQL injection in agent name @regression @edge @security", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        agent: "'; DROP TABLE agents; --",
        type: "heartbeat",
        content: "test",
      },
    });
    expect(res.status()).toBeLessThan(500);
  });

  test("workflow create with SQL injection in name @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: "' UNION SELECT token_hash FROM user_sessions --",
        description: "test",
        nodes: [],
        edges: [],
      },
    });
    expect(res.status()).toBeLessThan(500);
    await context.close();
  });

  test("register with SQL injection in email @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/auth/register`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        email: "' OR 1=1; --@test.com",
        password: "TestPass123!",
        role: "viewer",
      },
    });
    expect([400, 422]).toContain(res.status());
    await context.close();
  });
});

// ── Time-Based Blind SQL Injection ──────────────────────────

test.describe("SQL Injection — Time-based blind", () => {
  test("search param with SLEEP does not delay response beyond 5s @regression @edge @security", async ({ request }) => {
    const start = Date.now();
    const res = await request.get(
      `${MC_URL}/api/traces?search=${encodeURIComponent("1' AND SLEEP(10) --")}`,
      { headers: authHeaders() }
    );
    const elapsed = Date.now() - start;
    // If SQL injection worked, SLEEP(10) would delay 10+ seconds
    expect(elapsed).toBeLessThan(8000);
    expect(res.status()).toBeLessThan(500);
  });

  test("agent filter with pg_sleep does not delay @regression @edge @security", async ({ request }) => {
    const start = Date.now();
    const res = await request.get(
      `${MC_URL}/api/costs/by-agent?agent=${encodeURIComponent("' OR pg_sleep(10) --")}`,
      { headers: authHeaders() }
    );
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(8000);
    expect(res.status()).toBeLessThan(500);
  });
});

// ── Stacked Queries ─────────────────────────────────────────

test.describe("SQL Injection — Stacked queries", () => {
  test("stacked query in search param does not execute @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces?search=${encodeURIComponent("test'; INSERT INTO agents (id,name) VALUES ('hacked','hacked'); --")}`,
      { headers: authHeaders() }
    );
    expect(res.status()).toBeLessThan(500);
    // Verify no agent was created
    const verify = await request.get(`${MC_URL}/api/tools/agents-live`, {
      headers: authHeaders(),
    });
    if (verify.status() === 200) {
      const body = await verify.json();
      const agents = body.agents ?? body;
      if (Array.isArray(agents)) {
        expect(agents.find((a: any) => a.name === "hacked")).toBeUndefined();
      }
    }
  });
});
