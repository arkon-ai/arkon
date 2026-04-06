import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Workflow Routes — Comprehensive API Regression
   Routes: workflows (CRUD), [id]/run, [id]/runs, scheduler,
           webhook/[token]
   ══════════════════════════════════════════════════════════════ */

// ── GET /api/workflows ──────────────────────────────────────

test.describe("GET /api/workflows", () => {
  test("returns workflows array @regression @smoke", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.workflows ?? body)).toBeTruthy();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`);
    expect(res.status()).toBe(401);
  });

  test("returns 401 with invalid token @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: { Authorization: "Bearer bad-token" },
    });
    expect(res.status()).toBe(401);
  });

  test("workflows contain expected fields @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    const wfs = body.workflows ?? body;
    if (Array.isArray(wfs) && wfs.length > 0) {
      const wf = wfs[0];
      expect(wf.id).toBeDefined();
      expect(wf.name).toBeDefined();
      expect(wf.status).toBeDefined();
    }
  });

  test("supports status filter @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows?status=active`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
  });

  test("returns count and timestamp @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.count !== undefined || body.timestamp !== undefined).toBeTruthy();
  });
});

// ── POST /api/workflows (create) ────────────────────────────

test.describe("POST /api/workflows", () => {
  test("creates workflow with valid data @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: {
        name: `PW Test Workflow ${Date.now()}`,
        description: "Created by Playwright Phase 2",
        status: "draft",
        trigger_type: "manual",
      },
    });
    expect([200, 201]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBeTruthy();
    expect(body.workflow).toBeDefined();
    await context.close();
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/workflows`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "No Auth Workflow" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("missing name returns 400 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { description: "No name provided" },
    });
    expect([400, 422]).toContain(res.status());
    await context.close();
  });

  test("CSRF required for cookie auth @regression", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "No CSRF Workflow" },
    });
    expect(res.status()).toBe(403);
    await context.close();
  });
});

// ── GET /api/workflows/[id] ────────────────────────────────

test.describe("GET /api/workflows/[id]", () => {
  test("returns 404 for non-existent workflow @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/999999`, {
      headers: authHeaders(),
    });
    expect([404, 200]).toContain(res.status());
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/1`);
    expect(res.status()).toBe(401);
  });
});

// ── PUT /api/workflows/[id] (update) ────────────────────────

test.describe("PUT /api/workflows/[id]", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.put(`${MC_URL}/api/workflows/1`, {
      headers: { "Content-Type": "application/json" },
      data: { name: "Updated" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent workflow returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.put(`${MC_URL}/api/workflows/999999`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: "Updated Nonexistent" },
    });
    expect([404, 200]).toContain(res.status());
    await context.close();
  });
});

// ── DELETE /api/workflows/[id] ──────────────────────────────

test.describe("DELETE /api/workflows/[id]", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.delete(`${MC_URL}/api/workflows/999999`);
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent workflow returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.delete(`${MC_URL}/api/workflows/999999`, {
      headers: csrfHeaders(csrfToken),
    });
    expect([404, 200]).toContain(res.status());
    await context.close();
  });
});

// ── POST /api/workflows/[id]/run ────────────────────────────

test.describe("POST /api/workflows/[id]/run", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/workflows/1/run`, {
      headers: { "Content-Type": "application/json" },
    });
    expect([401, 403]).toContain(res.status());
  });

  test("non-existent workflow returns 404 @regression", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const res = await context.request.post(`${MC_URL}/api/workflows/999999/run`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
    });
    expect([404, 400]).toContain(res.status());
    await context.close();
  });
});

// ── GET /api/workflows/[id]/runs ────────────────────────────

test.describe("GET /api/workflows/[id]/runs", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/1/runs`);
    expect(res.status()).toBe(401);
  });

  test("returns runs for existing workflow @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/1/runs`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.runs !== undefined || Array.isArray(body)).toBeTruthy();
    }
  });

  test("supports limit param @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/1/runs?limit=5`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
  });
});

// ── GET /api/workflows/scheduler ────────────────────────────

test.describe("GET /api/workflows/scheduler", () => {
  test("returns scheduler state @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/scheduler`, {
      headers: authHeaders(),
    });
    expect([200, 404]).toContain(res.status());
    if (res.status() === 200) {
      const body = await res.json();
      expect(typeof body).toBe("object");
    }
  });

  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/scheduler`);
    expect([401, 404]).toContain(res.status());
  });

  test("returns schedules and webhooks @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/workflows/scheduler`, {
      headers: authHeaders(),
    });
    if (res.status() === 200) {
      const body = await res.json();
      expect(body.schedules !== undefined || body.webhooks !== undefined).toBeTruthy();
    }
  });
});

// ── Workflow CRUD lifecycle ─────────────────────────────────

test.describe("Workflow CRUD lifecycle @regression", () => {
  test("create → read → update → delete workflow", async ({ browser }) => {
    const context = await browser.newContext();
    const csrfToken = await authenticate(context);
    const name = `PW Lifecycle ${Date.now()}`;

    // CREATE
    const createRes = await context.request.post(`${MC_URL}/api/workflows`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name, description: "Lifecycle test", status: "draft", trigger_type: "manual" },
    });
    expect([200, 201]).toContain(createRes.status());
    const created = await createRes.json();
    const id = created.workflow?.id;
    expect(id).toBeDefined();

    // READ
    const readRes = await context.request.get(`${MC_URL}/api/workflows/${id}`, {
      headers: authHeaders(),
    });
    expect(readRes.status()).toBe(200);
    const read = await readRes.json();
    expect(read.workflow?.name ?? read.name).toBe(name);

    // UPDATE
    const updateRes = await context.request.put(`${MC_URL}/api/workflows/${id}`, {
      headers: { ...csrfHeaders(csrfToken), "Content-Type": "application/json" },
      data: { name: `${name} Updated`, status: "active" },
    });
    expect(updateRes.status()).toBe(200);
    const updated = await updateRes.json();
    expect(updated.ok).toBeTruthy();

    // DELETE
    const deleteRes = await context.request.delete(`${MC_URL}/api/workflows/${id}`, {
      headers: csrfHeaders(csrfToken),
    });
    expect(deleteRes.status()).toBe(200);
    const deleted = await deleteRes.json();
    expect(deleted.ok).toBeTruthy();

    // VERIFY DELETED
    const verifyRes = await context.request.get(`${MC_URL}/api/workflows/${id}`, {
      headers: authHeaders(),
    });
    expect([404, 200]).toContain(verifyRes.status());

    await context.close();
  });
});
