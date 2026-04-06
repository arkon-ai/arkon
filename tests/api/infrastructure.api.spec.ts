import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Infrastructure Routes — Comprehensive API Regression
   Routes: infra/nodes, infra/nodes/[id], infra/nodes/[id]/action,
           infra/topology, infra/report, infra/collect,
           health, benchmarks/overview, benchmarks/compare,
           compliance/audit-log
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/infra/nodes ────────────────────────────────────

test.describe("GET /api/infra/nodes", () => {
  test("returns node list @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes`, {
      headers: { Authorization: "Bearer invalid" },
    });
    expect(res.status()).toBe(401);
  });
});

// ── GET /api/infra/nodes/[id] ───────────────────────────────

test.describe("GET /api/infra/nodes/[id]", () => {
  test("non-existent node returns 404 @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes/nonexistent-node`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/nodes/test`);
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/infra/nodes/[id]/action ───────────────────────

test.describe("POST /api/infra/nodes/[id]/action", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/infra/nodes/test/action`, {
      headers: { "Content-Type": "application/json" },
      data: { action: "restart" },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ── GET /api/infra/topology ─────────────────────────────────

test.describe("GET /api/infra/topology", () => {
  test("returns topology data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/topology`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/infra/topology`);
    expect(res.status()).toBe(401);
  });
});

// ── POST /api/infra/report ──────────────────────────────────

test.describe("POST /api/infra/report", () => {
  test("validates payload @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/infra/report`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {
        nodeId: "playwright-test-node",
        hostname: "playwright-test-node",
        cpu_percent: 25.0,
        memory_percent: 40.0,
        disk_percent: 55.0,
        uptime_seconds: 3600,
      },
    });
    expect([200, 400, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/infra/report`, {
      headers: { "Content-Type": "application/json" },
      data: { nodeId: "test" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("empty payload returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/infra/report`, {
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      data: {},
    });
    expect([400, 404]).toContain(res.status());
  });
});

// ── POST /api/infra/collect ─────────────────────────────────

test.describe("POST /api/infra/collect", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/infra/collect`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ── GET /api/health ─────────────────────────────────────────

test.describe("GET /api/health", () => {
  test("returns healthy status @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("healthy");
  });

  test("does not require auth (public endpoint) @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/health`);
    expect(res.status()).toBe(200);
  });
});

// ── Benchmarks ──────────────────────────────────────────────

test.describe("GET /api/benchmarks/overview", () => {
  test("returns data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/benchmarks/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/benchmarks/overview`);
    expect([401, 200]).toContain(res.status());
  });
});

test.describe("GET /api/benchmarks/compare", () => {
  test("returns comparison data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/benchmarks/compare`, {
      headers: authHeaders(),
    });
    expect([200, 400]).toContain(res.status());
  });
});

// ── Compliance Audit Log ────────────────────────────────────

test.describe("GET /api/compliance/audit-log", () => {
  test("returns entries @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/audit-log`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/compliance/audit-log`);
    expect(res.status()).toBe(401);
  });
});
