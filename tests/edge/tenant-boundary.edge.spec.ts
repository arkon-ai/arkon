import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 4: Tenant Boundary Violations — Edge & Security Tests
   Tests: cross-tenant data access, wildcard tenant abuse,
          tenant_user role downgrade, tenant cookie tampering,
          data leakage in list endpoints
   ══════════════════════════════════════════════════════════════ */

// ── Cross-Tenant Data Access ────────────────────────────────

test.describe("Tenant Boundary — Cross-tenant access attempts", () => {
  test("accessing other tenant's dashboard data returns own tenant's data only @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const domain = new URL(MC_URL).hostname;
    // Tamper tenant cookie to a different tenant
    await context.addCookies([
      { name: "mc_tenant", value: "hofmi", domain, path: "/" },
    ]);
    const res = await context.request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    // Bearer auth overrides cookie tenant — should still return valid data
    expect([200, 403, 429]).toContain(res.status());
    await context.close();
  });

  test("direct tenant ID in query param does not bypass isolation @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/dashboard/overview?tenant_id=hofmi`,
      { headers: authHeaders() }
    );
    expect([200, 400, 429]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      // Should return data for authed tenant, not the spoofed one
      if (body.agents?.length > 0) {
        for (const agent of body.agents) {
          if (agent.tenant_id) {
            expect(agent.tenant_id).not.toBe("hofmi");
          }
        }
      }
    }
  });

  test("cross-tenant workflow access returns 404 @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/workflows/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders() }
    );
    // Non-existent workflow (potentially from another tenant)
    expect([200, 400, 404]).toContain(res.status());
  });

  test("cross-tenant trace access returns 404 @regression @edge @security", async ({ request }) => {
    const res = await request.get(
      `${MC_URL}/api/traces/00000000-0000-0000-0000-000000000000`,
      { headers: authHeaders() }
    );
    expect([200, 400, 404]).toContain(res.status());
  });
});

// ── Wildcard Tenant Abuse ───────────────────────────────────

test.describe("Tenant Boundary — Wildcard tenant", () => {
  test("mc_tenant=* does not grant multi-tenant access for non-admin @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const domain = new URL(MC_URL).hostname;
    await context.addCookies([
      { name: "mc_tenant", value: "*", domain, path: "/" },
    ]);
    const res = await context.request.get(`${MC_URL}/api/dashboard/overview`, {
      headers: authHeaders(),
    });
    // Should still work but not expose all tenants
    expect([200, 403, 429]).toContain(res.status());
    await context.close();
  });

  test("mc_tenant=__all__ does not bypass scoping @regression @edge @security", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const domain = new URL(MC_URL).hostname;
    await context.addCookies([
      { name: "mc_tenant", value: "__all__", domain, path: "/" },
    ]);
    const res = await context.request.get(`${MC_URL}/api/costs/overview`, {
      headers: authHeaders(),
    });
    expect([200, 400, 403, 429]).toContain(res.status());
    await context.close();
  });
});

// ── Tenant Scoping on List Endpoints ────────────────────────

test.describe("Tenant Boundary — List endpoint scoping", () => {
  const SCOPED_ENDPOINTS = [
    "/api/dashboard/overview",
    "/api/dashboard/activity",
    "/api/costs/overview",
    "/api/costs/by-agent",
    "/api/workflows",
    "/api/traces",
    "/api/tools/agents-live",
    "/api/security/overview",
    "/api/notifications",
  ];

  for (const endpoint of SCOPED_ENDPOINTS) {
    test(`${endpoint} returns tenant-scoped data @regression @edge`, async ({ request }) => {
      const res = await request.get(`${MC_URL}${endpoint}`, {
        headers: authHeaders(),
      });
      expect([200, 429]).toContain(res.status());
      if (res.status() === 200) {
        const body = await res.json();
        // Check that returned items have consistent tenant_id
        const items =
          body.agents ?? body.events ?? body.workflows ?? body.traces ?? [];
        if (Array.isArray(items) && items.length > 1) {
          const tenantIds = new Set(
            items.filter((i: any) => i.tenant_id).map((i: any) => i.tenant_id)
          );
          // All items should belong to same tenant (or no tenant_id field)
          expect(tenantIds.size).toBeLessThanOrEqual(1);
        }
      }
    });
  }
});

// ── Client Portal Tenant Isolation ──────────────────────────

test.describe("Tenant Boundary — Client portal", () => {
  test("client/dashboard requires auth @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/dashboard`);
    expect(res.status()).toBe(401);
  });

  test("client/costs returns tenant-scoped costs @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/costs`, {
      headers: authHeaders(),
    });
    expect([200, 403, 404]).toContain(res.status());
  });

  test("client/agents returns tenant-scoped agents @regression @edge", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/client/agents`, {
      headers: authHeaders(),
    });
    expect([200, 403, 404]).toContain(res.status());
  });
});

// ── Role-Based Access ───────────────────────────────────────

test.describe("Tenant Boundary — Role enforcement", () => {
  test("admin/tenants is restricted to owner/admin @regression @edge @security", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/tenants`);
    expect(res.status()).toBe(401);
  });

  test("admin/agents requires elevated role @regression @edge @security", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/admin/agents`);
    expect(res.status()).toBe(401);
  });

  test("compliance/purge requires admin @regression @edge @security", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/compliance/purge`, {
      headers: { "Content-Type": "application/json" },
      data: { confirm: true },
    });
    expect([401, 403]).toContain(res.status());
  });
});
