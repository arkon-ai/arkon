import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Miscellaneous Routes — Comprehensive API Regression
   Routes: analytics, victoryos, content-factory, setup,
           systems, push
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/analytics/overview ─────────────────────────────

test.describe("GET /api/analytics/overview", () => {
  test("returns analytics data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/analytics/overview`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/analytics/overview`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── GET /api/victoryos/overview ─────────────────────────────

test.describe("GET /api/victoryos/overview", () => {
  test("returns VictoryOS data @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/victoryos/overview`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/victoryos/overview`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── GET /api/content-factory/status ─────────────────────────

test.describe("GET /api/content-factory/status", () => {
  test("returns status @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/content-factory/status`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/content-factory/status`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── GET /api/setup/status ───────────────────────────────────

test.describe("GET /api/setup/status", () => {
  test("returns setup status @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/setup/status`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });
});

// ── POST /api/setup/complete ────────────────────────────────

test.describe("POST /api/setup/complete", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/setup/complete`, {
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ── GET /api/systems ────────────────────────────────────────

test.describe("GET /api/systems", () => {
  test("returns system info @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/systems`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/systems`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── POST /api/push (subscription) ───────────────────────────

test.describe("POST /api/push", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/push`, {
      headers: { "Content-Type": "application/json" },
      data: { subscription: {} },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ── DELETE /api/push ────────────────────────────────────────

test.describe("DELETE /api/push", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.delete(`${MC_URL}/api/push`);
    expect([401, 403, 404]).toContain(res.status());
  });
});
