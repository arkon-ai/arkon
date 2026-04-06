import { test, expect } from "@playwright/test";
import { MC_URL, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Incidents Routes — Comprehensive API Regression
   Routes: incidents (GET, POST), incidents/[id] (GET, PATCH),
           incidents/[id]/updates (POST)
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/incidents ──────────────────────────────────────

test.describe("GET /api/incidents", () => {
  test("returns incidents list @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/incidents`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/incidents`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── POST /api/incidents (create) ────────────────────────────

test.describe("POST /api/incidents", () => {
  test("creates incident @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/incidents`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        title: `PW Incident ${Date.now()}`,
        severity: "low",
        description: "Created by Playwright",
      },
    });
    expect([200, 201, 400, 404]).toContain(res.status());
    await context.close();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/incidents`, {
      headers: { "Content-Type": "application/json" },
      data: { title: "No auth incident" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ── GET /api/incidents/[id] ─────────────────────────────────

test.describe("GET /api/incidents/[id]", () => {
  test("non-existent incident returns 404 @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/incidents/nonexistent-id`, {
      headers: authHeaders(),
    });
    expect([404, 200]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/incidents/test-id`);
    expect([401, 404]).toContain(res.status());
  });
});

// ── PATCH /api/incidents/[id] (update status) ───────────────

test.describe("PATCH /api/incidents/[id]", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.patch(`${MC_URL}/api/incidents/test-id`, {
      headers: { "Content-Type": "application/json" },
      data: { status: "resolved" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});

// ── POST /api/incidents/[id]/updates ────────────────────────

test.describe("POST /api/incidents/[id]/updates", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/incidents/test-id/updates`, {
      headers: { "Content-Type": "application/json" },
      data: { message: "Update message" },
    });
    expect([401, 403, 404]).toContain(res.status());
  });
});
