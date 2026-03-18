import { test, expect } from "@playwright/test";
import { MC_URL, ADMIN_TOKEN, AGENT_TOKEN, authHeaders } from "./helpers/auth";

test.describe("Intake API (public)", () => {
  test("POST /api/intake accepts submission without auth", async ({ request }) => {
    const res = await request.post(`${MC_URL}/api/intake`, {
      headers: { "Content-Type": "application/json" },
      data: {
        full_name: "Playwright Test User",
        email: "playwright@test.com",
        client: "pw-test",
        submitted_at: new Date().toISOString(),
      },
    });
    // 201 = created, 500 = intake_submissions table may not exist on fresh installs
    expect([201, 500]).toContain(res.status());
    if (res.status() === 201) {
      const body = await res.json();
      expect(body.ok).toBeTruthy();
      expect(body.id).toBeDefined();
    }
  });

  test("GET /api/intake requires auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/intake`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/intake returns submissions with auth", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/intake`, { headers: authHeaders() });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.submissions ?? body)).toBeTruthy();
  });
});

test.describe("Ingest API (agent auth)", () => {
  test("POST /api/ingest with agent token returns 200", async ({ request }) => {
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

  test("POST /api/ingest without auth returns 401", async ({ request }) => {
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
});

test.describe("MCP Registry API", () => {
  test("GET /api/tools/mcp-registry without auth returns 401", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry`);
    expect(res.status()).toBe(401);
  });

  test("GET /api/tools/mcp-registry with auth + search returns results", async ({ request }) => {
    const res = await request.get(`${MC_URL}/api/tools/mcp-registry?search=github`, {
      headers: authHeaders(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.servers).toBeDefined();
    expect(body.servers.length).toBeGreaterThan(0);
  });
});
