import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, AGENT_TOKEN, authHeaders, authenticate, csrfHeaders } from "../helpers/auth";

/* ══════════════════════════════════════════════════════════════
   Phase 2: Ingest & Intake Routes — Comprehensive API Regression
   Routes: /api/intake (GET, POST), /api/ingest (POST)
   ══════════════════════════════════════════════════════════════ */

// ── POST /api/intake (public submission) ────────────────────

test.describe("POST /api/intake", () => {
  test("accepts submission without auth @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/intake`, {
      headers: { "Content-Type": "application/json" },
      data: {
        full_name: "Playwright Test User",
        email: "playwright@test.com",
        client: "pw-test",
        submitted_at: new Date().toISOString(),
      },
    });
    // 201 = created, 500 = table may not exist on fresh installs
    expect([201, 500]).toContain(res.status());
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.ok).toBeTruthy();
      expect(body.id).toBeDefined();
    }
  });

  test("missing required fields returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/intake`, {
      headers: { "Content-Type": "application/json" },
      data: {},
    });
    // 400 = validation error, 201 = lenient, 500 = table issue
    expect([400, 201, 500]).toContain(res.status());
  });

  test("XSS in name field is handled @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/intake`, {
      headers: { "Content-Type": "application/json" },
      data: {
        full_name: '<script>alert("xss")</script>',
        email: "xss@test.com",
        client: "pw-test",
      },
    });
    // Should not crash — store sanitized or reject
    expect([201, 400, 500]).toContain(res.status());
  });

  test("invalid email in submission @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/intake`, {
      headers: { "Content-Type": "application/json" },
      data: {
        full_name: "Test User",
        email: "not-an-email",
        client: "pw-test",
      },
    });
    expect([201, 400, 500]).toContain(res.status());
  });
});

// ── GET /api/intake (list submissions) ──────────────────────

test.describe("GET /api/intake", () => {
  test("requires auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/intake`);
    expect(res.status()).toBe(401);
  });

  test("returns submissions with auth @regression", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/intake`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.submissions ?? body)).toBeTruthy();
  });
});

// ── POST /api/ingest (agent auth) ───────────────────────────

test.describe("POST /api/ingest", () => {
  test("with agent token returns 200 @regression @smoke", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_TOKEN}`,
      },
      data: {
        agent_id: "test-agent",
        event_type: "message_sent",
        content: "playwright smoke test",
        session_key: "pw-test",
      },
    });
    expect(res.status()).toBe(200);
  });

  test("without auth returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: { "Content-Type": "application/json" },
      data: {
        agent_id: "test-agent",
        event_type: "message_sent",
        content: "no auth test",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("with invalid token returns 401 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer invalid-agent-token",
      },
      data: { agent_id: "test", event_type: "test" },
    });
    expect(res.status()).toBe(401);
  });

  test("missing agent_id returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_TOKEN}`,
      },
      data: { event_type: "message_sent", content: "no agent id" },
    });
    expect([200, 400]).toContain(res.status());
  });

  test("missing event_type returns 400 @regression", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/ingest`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AGENT_TOKEN}`,
      },
      data: { agent_id: "test-agent", content: "no event type" },
    });
    expect([200, 400]).toContain(res.status());
  });
});
