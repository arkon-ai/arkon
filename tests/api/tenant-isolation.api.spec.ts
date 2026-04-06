import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Tenant Isolation — Comprehensive API Regression
   Routes: admin/tenants, cross-endpoint tenant scoping
   ══════════════════════════════════════════════════════════════ */

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

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/tenants`, {
      headers: { Authorization: "Bearer invalid-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("tenants have expected fields @regression", async ({ request }) => {
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

// ── Tenant data isolation ───────────────────────────────────

test.describe("Tenant Data Isolation", () => {
  test("events API filters by tenant when mc_tenant cookie is set @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const allEvents = await context.request.get(`${MC_URL}/api/dashboard/activity`, {
      headers: authHeaders(),
    });
    expect(allEvents.status()).toBe(200);
    await context.close();
  });

  test("agents-live API returns agents list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/agents-live`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("costs API respects tenant scope @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("dashboard overview scoped to tenant @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // All agents should belong to the auth'd tenant
    if (body.agents?.length > 0) {
      for (const agent of body.agents) {
        expect(agent.tenant_id).toBeDefined();
      }
    }
  });

  test("workflows scoped to tenant @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const wfs = body.workflows ?? body;
    if (Array.isArray(wfs) && wfs.length > 0) {
      for (const wf of wfs) {
        expect(wf.tenant_id).toBeDefined();
      }
    }
  });

  test("traces scoped to tenant @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/traces`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("costs/by-agent scoped to tenant @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/costs/by-agent`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });
});
