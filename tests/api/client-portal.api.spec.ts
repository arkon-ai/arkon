import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

// API specs authenticate explicitly per-request — run without the ambient
// admin storageState so negative-auth tests are genuinely unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

// The owner token is fleet-wide (tenant "*"): /api/client/* needs a tenant to scope to, else 401 by design
// (src/lib/tenant-access.ts resolveTenantAccess fails closed). scripts/seed-e2e.ts seeds 'transformate'.
const E2E_TENANT = "transformate";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Client Portal Routes — Comprehensive API Regression
   Routes: client/dashboard, client/agents, client/costs,
           client/api-keys
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/client/dashboard ───────────────────────────────

test.describe("GET /api/client/dashboard", () => {
  test("returns dashboard overview @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/dashboard?tenant_id=${E2E_TENANT}`, {
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
    const res = await request.get(`${MC_URL}/api/client/agents?tenant_id=${E2E_TENANT}`, {
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
    const res = await request.get(`${MC_URL}/api/client/costs?tenant_id=${E2E_TENANT}`, {
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
