import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Client Portal Routes — Comprehensive API Regression
   Routes: client/dashboard, client/agents, client/costs,
           client/api-keys
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/client/dashboard ───────────────────────────────

test.describe("GET /api/client/dashboard", () => {
  test("returns dashboard overview @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/dashboard`, {
      headers: authHeaders(),
    });
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/dashboard`);
    expect(res.status()).toBe(401);
  });
});

// ── GET /api/client/agents ──────────────────────────────────

test.describe("GET /api/client/agents", () => {
  test("returns tenant-scoped agents @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/agents`, {
      headers: authHeaders(),
    });
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/agents`);
    expect(res.status()).toBe(401);
  });
});

// ── GET /api/client/costs ───────────────────────────────────

test.describe("GET /api/client/costs", () => {
  test("returns tenant-scoped costs @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/costs`, {
      headers: authHeaders(),
    });
    expect([200, 403]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/costs`);
    expect(res.status()).toBe(401);
  });
});

// ── GET /api/client/api-keys ────────────────────────────────

test.describe("GET /api/client/api-keys (portal)", () => {
  test("returns tenant-scoped keys @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/api-keys`);
    expect(res.status()).toBe(401);
  });
});
