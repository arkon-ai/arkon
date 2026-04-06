import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Dashboard Routes — Comprehensive API Regression
   Routes: overview, overview/recent, activity, anomalies,
           trends, stream, agent/[id]
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/dashboard/overview ─────────────────────────────

test.describe("GET /api/dashboard/overview", () => {
  test("returns valid shape with auth @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    expect(body.agents).toBeDefined();
    expect(Array.isArray(body.agents)).toBeTruthy();
    expect(body.timestamp).toBeDefined();
  });

  test("returns 401 without auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`);
    expect([401, 429]).toContain(res.status());
  });

  test("agents array contains expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    if (body.agents?.length > 0) {
      const agent = body.agents[0];
      expect(agent.id).toBeDefined();
      expect(agent.name).toBeDefined();
      expect(agent.tenant_id).toBeDefined();
    }
  });

  test("includes todayStats @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.todayStats).toBeDefined();
    expect(Array.isArray(body.todayStats)).toBeTruthy();
  });

  test("includes tenants array @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tenants).toBeDefined();
    expect(Array.isArray(body.tenants)).toBeTruthy();
  });
});

// ── GET /api/dashboard/overview/recent ──────────────────────

test.describe("GET /api/dashboard/overview/recent", () => {
  test("returns recent events @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview/recent`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.events).toBeDefined();
      expect(Array.isArray(body.events)).toBeTruthy();
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview/recent`);
    expect([401, 429]).toContain(res.status());
  });

  test("respects limit param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview/recent?limit=3`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.events.length).toBeLessThanOrEqual(3);
    }
  });

  test("limit capped at 20 @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview/recent?limit=1000`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.events.length).toBeLessThanOrEqual(20);
    }
  });
});

// ── GET /api/dashboard/activity ─────────────────────────────

test.describe("GET /api/dashboard/activity", () => {
  test("returns events array @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
    // May have events array or be wrapped differently
    expect(body.events !== undefined || Array.isArray(body)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity`);
    expect([401, 429]).toContain(res.status());
  });

  test("supports limit param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity?limit=5`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const events = body.events ?? body;
    if (Array.isArray(events)) {
      expect(events.length).toBeLessThanOrEqual(5);
    }
  });

  test("supports since param (ISO date) @regression", async ({ request }) => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const res = await request.get(`${MC_URL}/api/dashboard/activity?since=${since}`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("events contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/activity?limit=1`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const events = body.events ?? body;
    if (Array.isArray(events) && events.length > 0) {
      const ev = events[0];
      expect(ev.id).toBeDefined();
      expect(ev.event_type || ev.type).toBeDefined();
      expect(ev.created_at).toBeDefined();
    }
  });
});

// ── GET /api/dashboard/anomalies ────────────────────────────

test.describe("GET /api/dashboard/anomalies", () => {
  test("returns 200 with auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/anomalies`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/anomalies`);
    expect([401, 429]).toContain(res.status());
  });

  test("returns anomalies array @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/anomalies`, {
      headers: authHeaders(),
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.anomalies !== undefined || Array.isArray(body)).toBeTruthy();
    }
  });

  test("supports unacknowledged filter @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/anomalies?unacknowledged=true`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
  });
});

// ── PATCH /api/dashboard/anomalies (acknowledge) ────────────

test.describe("PATCH /api/dashboard/anomalies", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.patch(`${MC_URL}/api/dashboard/anomalies`, {
      headers: { "Content-Type": "application/json" },
      data: { id: "nonexistent" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("requires CSRF for cookie auth @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/dashboard/anomalies`, {
      data: { id: "nonexistent" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });

  test("with CSRF acknowledges anomaly @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.patch(`${MC_URL}/api/dashboard/anomalies`, {
      headers: csrfHeaders(csrfToken),
      data: { id: "00000000-0000-0000-0000-000000000000" },
    });
    // 200 = acknowledged, 404 = not found
    expect([200, 404]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/dashboard/trends ───────────────────────────────

test.describe("GET /api/dashboard/trends", () => {
  test("returns trend data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/trends`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/trends`);
    expect([401, 429]).toContain(res.status());
  });

  test("supports range=7d @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/trends?range=7d`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
  });

  test("supports range=30d @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/trends?range=30d`, {
      headers: authHeaders(),
    });
    expect([200, 429]).toContain(res.status());
  });

  test("returns trend array and totals @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/trends`, {
      headers: authHeaders(),
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.trend !== undefined || body.totals !== undefined).toBeTruthy();
    }
  });
});

// ── GET /api/dashboard/stream (SSE) ─────────────────────────

test.describe("GET /api/dashboard/stream", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/stream`);
    expect([401, 429]).toContain(res.status());
  });

  test("returns SSE content-type with auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/stream`, {
      headers: authHeaders(),
    });
    if (res.status() === 200) {
      const ct = res.headers()["content-type"] ?? "";
      expect(ct).toContain("text/event-stream");
    }
  });
});
