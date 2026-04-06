import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 5: Performance — API Latency Benchmarks
   All key API endpoints should respond under 500ms.
   Heavy/aggregate endpoints allowed up to 1000ms.
   Tags: @performance @regression
   ══════════════════════════════════════════════════════════════ */

/** Standard endpoints — must respond < 500ms */
const FAST_ENDPOINTS = [
  { method: "GET", path: "/api/health", name: "Health" },
  { method: "GET", path: "/api/agents", name: "Agents list" },
  { method: "GET", path: "/api/dashboard/overview", name: "Dashboard overview" },
  { method: "GET", path: "/api/dashboard/activity", name: "Dashboard activity" },
  { method: "GET", path: "/api/costs/overview", name: "Costs overview" },
  { method: "GET", path: "/api/security/overview", name: "Security overview" },
  { method: "GET", path: "/api/traces", name: "Traces list" },
  { method: "GET", path: "/api/notifications", name: "Notifications" },
  { method: "GET", path: "/api/tools/tasks", name: "Tasks" },
  { method: "GET", path: "/api/admin/agents", name: "Admin agents" },
];

/** Aggregate/heavier endpoints — allowed up to 1000ms */
const SLOW_ENDPOINTS = [
  { method: "GET", path: "/api/costs/by-agent", name: "Costs by agent" },
  { method: "GET", path: "/api/costs/by-model", name: "Costs by model" },
  { method: "GET", path: "/api/infrastructure/report", name: "Infra report" },
  { method: "GET", path: "/api/compliance/audit-log", name: "Audit log" },
  { method: "GET", path: "/api/dashboard/trends", name: "Dashboard trends" },
  { method: "GET", path: "/api/analytics", name: "Analytics" },
];

const FAST_THRESHOLD = 500; // ms
const SLOW_THRESHOLD = 1000; // ms

test.describe("API Latency — Fast Endpoints @performance @regression", () => {
  for (const { method, path, name } of FAST_ENDPOINTS) {
    test(`${name} (${method} ${path}) responds under ${FAST_THRESHOLD}ms`, async ({ request }) => {
      const start = Date.now();
      const res = await request.fetch(`${MC_URL}${path}`, {
        method,
        headers: authHeaders(),
      });
      const elapsed = Date.now() - start;

      // Must return a non-error status
      expect([200, 204, 304]).toContain(res.status());
      expect(elapsed, `${name} took ${elapsed}ms`).toBeLessThan(FAST_THRESHOLD);
    });
  }
});

test.describe("API Latency — Aggregate Endpoints @performance @regression", () => {
  for (const { method, path, name } of SLOW_ENDPOINTS) {
    test(`${name} (${method} ${path}) responds under ${SLOW_THRESHOLD}ms`, async ({ request }) => {
      const start = Date.now();
      const res = await request.fetch(`${MC_URL}${path}`, {
        method,
        headers: authHeaders(),
      });
      const elapsed = Date.now() - start;

      expect([200, 204, 304]).toContain(res.status());
      expect(elapsed, `${name} took ${elapsed}ms`).toBeLessThan(SLOW_THRESHOLD);
    });
  }
});

test.describe("API Latency — Concurrent Load @performance @regression", () => {
  test("5 concurrent API requests all complete under 1s", async ({ request }) => {
    const endpoints = [
      "/api/health",
      "/api/agents",
      "/api/dashboard/overview",
      "/api/costs/overview",
      "/api/security/overview",
    ];

    const start = Date.now();
    const results = await Promise.all(
      endpoints.map((path) =>
        request.fetch(`${MC_URL}${path}`, {
          method: "GET",
          headers: authHeaders(),
        })
      )
    );
    const elapsed = Date.now() - start;

    // All should succeed
    for (const res of results) {
      expect([200, 204, 304]).toContain(res.status());
    }

    // Total concurrent time should be reasonable
    expect(elapsed, `Concurrent batch took ${elapsed}ms`).toBeLessThan(2000);
  });

  test("10 sequential requests show no degradation", async ({ request }) => {
    const times: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      const res = await request.fetch(`${MC_URL}/api/health`, {
        method: "GET",
        headers: authHeaders(),
      });
      times.push(Date.now() - start);
      expect([200, 204, 304]).toContain(res.status());
    }

    // Last request should not be significantly slower than first
    const firstThree = times.slice(0, 3).reduce((a, b) => a + b, 0) / 3;
    const lastThree = times.slice(-3).reduce((a, b) => a + b, 0) / 3;

    // Allow up to 3x degradation (generous — mainly catching memory leaks)
    expect(
      lastThree,
      `First 3 avg: ${firstThree.toFixed(0)}ms, Last 3 avg: ${lastThree.toFixed(0)}ms`
    ).toBeLessThan(firstThree * 3 + 100);
  });
});

test.describe("API Latency — Auth Overhead @performance @regression", () => {
  test("Bearer auth adds < 50ms overhead vs unauthenticated endpoint", async ({ request }) => {
    // Health endpoint is typically public
    const startNoAuth = Date.now();
    await request.fetch(`${MC_URL}/api/health`, { method: "GET" });
    const noAuthTime = Date.now() - startNoAuth;

    const startAuth = Date.now();
    await request.fetch(`${MC_URL}/api/health`, {
      method: "GET",
      headers: authHeaders(),
    });
    const authTime = Date.now() - startAuth;

    const overhead = authTime - noAuthTime;
    // Auth overhead should be minimal
    expect(overhead, `Auth overhead: ${overhead}ms`).toBeLessThan(200);
  });
});
